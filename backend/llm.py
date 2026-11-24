"""Single entry point for every LLM call in ProjectIQ.

Why: a 3B model on a laptop CPU needs minutes per agent. A hosted model answers
the same prompt in 1-3 seconds, so the whole analysis finishes in about 15 seconds.

Providers (choose with PROJECTIQ_LLM_PROVIDER, or just set an API key):
    groq     fast hosted Llama models (free tier available)       <- recommended
    gemini   Google Gemini through its OpenAI-compatible endpoint
    openai   any OpenAI-compatible service (set PROJECTIQ_API_BASE)
    ollama   fully local, no internet needed (slow without a GPU)

Settings go in backend/.env (see .env.example) or in environment variables.
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

ENV_FILE: Optional[Path] = None
try:  # optional: python-dotenv is already in requirements.txt
    from dotenv import load_dotenv

    _here = Path(__file__).resolve().parent
    for _candidate in (_here / ".env", _here.parent / ".env"):
        if _candidate.is_file():
            # override=True: an empty PROJECTIQ_API_KEY left in the shell must not hide the key in .env
            load_dotenv(_candidate, override=True)
            ENV_FILE = _candidate
            break
except Exception:  # pragma: no cover - the app still works with real env vars
    pass

logger = logging.getLogger("projectiq.llm")

PRESETS = {
    "groq": {
        "base": "https://api.groq.com/openai/v1",
        "model": "openai/gpt-oss-120b",  # Groq retired llama-3.3-70b-versatile on 2026-08-16
        "key_vars": ("GROQ_API_KEY",),
    },
    "gemini": {
        "base": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-2.5-flash",
        "key_vars": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    },
    "openai": {
        "base": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "key_vars": ("OPENAI_API_KEY",),
    },
}


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip().strip("\"'").strip()


def _first_key(provider: str) -> str:
    key = _env("PROJECTIQ_API_KEY")
    if key:
        return key
    for var in PRESETS.get(provider, {}).get("key_vars", ()):
        if _env(var):
            return _env(var)
    return ""


def _detect_provider() -> str:
    chosen = _env("PROJECTIQ_LLM_PROVIDER").lower()
    if chosen:
        return chosen
    if _env("PROJECTIQ_API_KEY") or _env("GROQ_API_KEY"):
        return "groq"
    if _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY"):
        return "gemini"
    return "ollama"


PROVIDER = _detect_provider()
REMOTE = PROVIDER != "ollama"
_preset = PRESETS.get(PROVIDER, {})

API_KEY = _first_key(PROVIDER) if REMOTE else ""
API_BASE = (_env("PROJECTIQ_API_BASE") or _preset.get("base", "")).rstrip("/")
CHAT_MODEL = _env("PROJECTIQ_CHAT_MODEL") or (_preset.get("model") if REMOTE else "llama3.2:3b")

# Local-model tuning (only used by the ollama provider)
NUM_CTX = int(_env("PROJECTIQ_NUM_CTX", "4096"))
KEEP_ALIVE = _env("PROJECTIQ_KEEP_ALIVE", "30m")

# Hosted models are fast and have big context windows, so agents can read more.
AGENT_CONTEXT_CHARS = int(_env("PROJECTIQ_AGENT_CONTEXT_CHARS", "11000" if REMOTE else "7000"))
REQUEST_TIMEOUT = int(_env("PROJECTIQ_REQUEST_TIMEOUT", "60"))
MAX_RETRIES = int(_env("PROJECTIQ_MAX_RETRIES", "3"))


def key_hint() -> str:
    # Never reveal any part of the key; only say whether one is loaded.
    return "set (hidden)" if API_KEY else ""


def describe() -> dict:
    """What the backend is really using (shown in the UI and /api/llm/test)."""
    note = None
    if not REMOTE:
        note = ("No API key was loaded, so the slow local Ollama model is used. "
                "Put PROJECTIQ_API_KEY=gsk_... in backend/.env and restart the backend.")
    return {
        "provider": PROVIDER, "model": CHAT_MODEL, "remote": REMOTE,
        "key_loaded": bool(API_KEY), "key_hint": key_hint(),
        "env_file": str(ENV_FILE) if ENV_FILE else None, "note": note,
    }


if REMOTE:
    logger.info("LLM: %s / %s (API key %s, .env: %s)", PROVIDER, CHAT_MODEL,
                key_hint() or "MISSING", ENV_FILE or "not found")
else:
    logger.warning("LLM: Ollama (slow). No API key found; .env file: %s. "
                   "Set PROJECTIQ_API_KEY in backend/.env and restart.", ENV_FILE or "NOT FOUND")


class LLMError(RuntimeError):
    """Raised with a message that is safe to show to the user."""


# ------------------------------------------------------------- JSON handling
def _balance_json(fragment: str) -> str:
    """Close any open strings/brackets of a (possibly truncated) JSON fragment."""
    stack: list[str] = []
    in_string = False
    escaped = False
    for ch in fragment:
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    out = fragment + ('"' if in_string else "")
    out = out.rstrip().rstrip(",")
    return out + "".join(reversed(stack))


def parse_json_object(raw: str) -> dict:
    """Parse model output as JSON, repairing truncation caused by token limits."""
    raw = (raw or "").strip()
    if raw.startswith("```"):  # some models wrap JSON in a code fence
        raw = raw.strip("`")
        raw = raw[4:] if raw.lower().startswith("json") else raw
        raw = raw.strip()
    try:
        value = json.loads(raw)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    start = raw.find("{")
    if start == -1:
        raise ValueError("Model returned no JSON object.")
    body = raw[start:]
    try:
        value = json.loads(_balance_json(body))
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    # Cut back to earlier closing braces until the fragment parses.
    positions = [i for i, ch in enumerate(body) if ch == "}"]
    for idx in reversed(positions[-40:]):
        try:
            value = json.loads(_balance_json(body[: idx + 1]))
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    raise ValueError("Model returned invalid JSON.")


# ------------------------------------------------------------------ providers
def _retry_wait(response: Any, attempt: int) -> float:
    header = response.headers.get("retry-after") if response is not None else None
    try:
        if header:
            return min(30.0, max(1.0, float(header)))
    except ValueError:
        pass
    return min(20.0, 2.0 * (attempt + 1))


def _error_text(response: Any) -> str:
    try:
        data = response.json()
        error = data.get("error", data)
        message = error.get("message") if isinstance(error, dict) else str(error)
        if message:
            return f"{PROVIDER} returned {response.status_code}: {message}"
    except Exception:
        pass
    return f"{PROVIDER} returned HTTP {response.status_code}."


def _chat_remote(messages: list[dict], json_mode: bool, max_tokens: int, temperature: float) -> str:
    if not API_KEY:
        raise LLMError(
            "No API key is set for the hosted model. Add PROJECTIQ_API_KEY to backend/.env "
            "(see .env.example), or set PROJECTIQ_LLM_PROVIDER=ollama to use the local model."
        )
    import requests  # imported lazily so pure-logic tests need no network libraries

    url = f"{API_BASE}/chat/completions"
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    body: dict[str, Any] = {
        "model": CHAT_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if CHAT_MODEL.startswith("openai/gpt-oss"):
        # gpt-oss models "think" first and the thinking counts against max_tokens:
        # keep it short and leave headroom so the visible answer is not cut off.
        body["reasoning_effort"] = "low"
        body["max_tokens"] = max_tokens + 400

    for attempt in range(MAX_RETRIES + 1):
        try:
            response = requests.post(url, headers=headers, json=body, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            if attempt < MAX_RETRIES:
                time.sleep(min(5.0, 1.0 + attempt))
                continue
            raise LLMError(f"Cannot reach {PROVIDER}. Check the internet connection. ({exc.__class__.__name__})") from exc

        status = response.status_code
        if status == 400 and "response_format" in body:
            body.pop("response_format")  # model rejected strict JSON mode; our parser repairs plain output
            continue
        if status == 400 and "reasoning_effort" in body:
            body.pop("reasoning_effort")  # model does not accept this option
            continue
        if (status == 429 or status >= 500) and attempt < MAX_RETRIES:
            wait = _retry_wait(response, attempt)
            logger.warning("%s returned %s; retrying in %.0fs", PROVIDER, status, wait)
            time.sleep(wait)
            continue
        if status in (401, 403):
            raise LLMError(f"{PROVIDER} rejected the API key. Check PROJECTIQ_API_KEY in backend/.env.")
        if status == 404:
            raise LLMError(f"Model '{CHAT_MODEL}' was not found at {PROVIDER}. Set PROJECTIQ_CHAT_MODEL to a model your account offers.")
        if status == 429:
            raise LLMError(f"{PROVIDER} rate limit reached. Wait a minute or use a smaller model.")
        if not response.ok:
            raise LLMError(_error_text(response))

        try:
            return response.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError) as exc:
            raise LLMError(f"{PROVIDER} returned an unexpected response.") from exc
    raise LLMError(f"{PROVIDER} did not answer.")  # pragma: no cover


def _chat_ollama(messages: list[dict], json_mode: bool, max_tokens: int, temperature: float) -> str:
    import ollama  # imported lazily: not needed when a hosted model is used

    kwargs: dict[str, Any] = {}
    if json_mode:
        kwargs["format"] = "json"
    response = ollama.chat(
        model=CHAT_MODEL,
        messages=messages,
        keep_alive=KEEP_ALIVE,
        options={"temperature": temperature, "num_predict": max_tokens, "num_ctx": NUM_CTX},
        **kwargs,
    )
    return response["message"]["content"] or ""


def chat_text(messages: list[dict], *, json_mode: bool = False, max_tokens: int = 800, temperature: float = 0.1) -> str:
    """Send a chat request to the configured provider and return the reply text."""
    started = time.perf_counter()
    try:
        text = (_chat_remote if REMOTE else _chat_ollama)(messages, json_mode, max_tokens, temperature)
    finally:
        logger.info("LLM call (%s, %s) took %.1fs", PROVIDER, CHAT_MODEL, time.perf_counter() - started)
    return text.strip()


def chat_json(system_prompt: str, user_prompt: str, max_tokens: int) -> dict:
    """One system+user exchange that must return a JSON object."""
    raw = chat_text(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        json_mode=True, max_tokens=max_tokens, temperature=0.1,
    )
    return parse_json_object(raw)


# ------------------------------------------------------------ status / warm-up
def check() -> tuple[bool, Optional[str]]:
    """Cheap readiness check used by the health endpoint (never raises)."""
    if REMOTE:
        if not API_KEY:
            return False, "No API key configured. Add PROJECTIQ_API_KEY to backend/.env."
        return True, None
    try:
        import ollama

        names = [m.model for m in ollama.Client(timeout=3).list().models]
        wanted = CHAT_MODEL.split(":")[0]
        if any(n.split(":")[0] == wanted for n in names):
            return True, None
        return False, f"Ollama model '{CHAT_MODEL}' is not installed. Run: ollama pull {CHAT_MODEL}"
    except Exception as exc:
        return False, f"Ollama is not reachable ({exc.__class__.__name__})."


def ping() -> dict:
    """One tiny real request: proves the key works and shows the latency."""
    started = time.perf_counter()
    try:
        chat_text([{"role": "user", "content": "Reply with the word ok."}], max_tokens=5, temperature=0.0)
        return {"ok": True, "seconds": round(time.perf_counter() - started, 2), **describe()}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "seconds": round(time.perf_counter() - started, 2), **describe()}


def warm_up() -> None:
    """Load a local model into memory so the first real request is not slow."""
    if REMOTE:
        return
    _chat_ollama([{"role": "user", "content": "ok"}], False, 1, 0.0)
