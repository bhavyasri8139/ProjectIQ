"""Run from backend/:  python scripts/check_llm.py

Tells you in one second whether ProjectIQ will use Groq (fast) or Ollama (slow),
and sends one tiny real request to prove the key works."""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
logging.disable(logging.CRITICAL)

import llm  # noqa: E402

info = llm.describe()
print(f"Provider : {info['provider']}   Model: {info['model']}")
print(f".env file: {info['env_file'] or 'NOT FOUND (expected backend/.env, not .env.txt)'}")
print(f"API key  : {'loaded (' + info['key_hint'] + ')' if info['key_loaded'] else 'NOT LOADED'}")
if info["note"]:
    print("\nPROBLEM  :", info["note"])
    sys.exit(1)
result = llm.ping()
if result["ok"]:
    print(f"\nOK: the model answered in {result['seconds']} s. Groq will now show API calls.")
else:
    print("\nFAILED:", result["error"])
    sys.exit(1)
