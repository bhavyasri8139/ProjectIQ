# ProjectIQ — AI Project Intelligence & Risk Advisor

Upload project documents (PDF, DOCX, TXT, CSV, XLSX) and get a living, queryable view of the project:
scope, risks, blockers, action items, generated documentation, a health score and a chat assistant,
all grounded in the uploaded files. Everything runs locally (FastAPI + ChromaDB + React) with either a hosted model (fast) or Ollama (offline).

## Why it is fast

| Problem | Fix |
|---|---|
| A 3B model on a laptop CPU needs minutes per agent, and every action restarted the whole analysis | The agents use a **hosted model (Groq, free key)**: about 1-3 s per call, so the whole analysis takes about 15 s. Ollama stays available as an offline fallback |
| Embeddings competed with the chat model inside Ollama | Embeddings use a **small built-in model** that runs inside the backend (about a second per document). Ollama is no longer needed for indexing |
| Upload waited for extraction, embedding and an LLM summary | `POST /api/documents/upload` returns at once. Files are indexed in the background; the summary is extractive (instant) |
| The page froze while Ollama was busy | `/api/health` is answered from a cache that a background thread refreshes, so it can never block the browser |
| Every toggle, delete or refresh started a new run from scratch | Quick actions are merged into one run (2 s debounce). A run that is already going is **stopped at its next stage** when documents change. Delete and the "In project" switch react on screen immediately |
| Results appeared only after clicking each agent | The full analysis runs automatically after indexing and is saved to `analysis_cache.json`. Pages read the saved results instantly, even after a restart |
| The risk register, action items and summary were extra LLM calls | They are rendered from the structured agent output (instant). Only user stories use one more LLM call (with a built-in fallback) |
| A failed agent just showed "not generated yet" | The page shows the real error (for example a missing API key) |

## Setup

Prerequisites: Python 3.11+, Node 20.19+ (or 22.12+). Ollama is **optional**.

1. Get a free API key at <https://console.groq.com> (API Keys).
2. In `backend/`, copy `.env.example` to `.env` and paste the key after `PROJECTIQ_API_KEY=`.

Backend (PowerShell, one command per line):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --port 8000
```

The first start downloads the small embedding model (about 80 MB, internet needed once).
Documents indexed by an older version are re-indexed automatically from `backend/uploads/`.

Frontend (second terminal):

```powershell
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The status box at the bottom left shows the active model and any problem.

**Without an API key** the backend falls back to Ollama (`ollama pull llama3.2:3b`) and still works,
but each analysis takes minutes on a CPU. Set `PROJECTIQ_EMBED_PROVIDER=ollama` only if you also want
Ollama embeddings (`ollama pull nomic-embed-text`).

## Check that the fast model is really used

From `backend/` run `python scripts\check_llm.py`. It prints the provider, whether the key was loaded and sends one test request.
If it says `ollama` / `NOT LOADED`, the analysis will be slow and the Groq console will show 0 API calls.
The key must be in `backend/.env` (not `.env.example`, not `.env.txt`) and the backend must be restarted afterwards.
The same information is at `http://localhost:8000/api/llm/test`. With the hosted model the scope, risk and blocker agents run at the same time
(set `PROJECTIQ_PARALLEL=1` if the free plan answers with rate-limit errors).

## Before the review (do this 10 minutes earlier)

1. Start the backend and the frontend (and Ollama only if you run without an API key).
2. Run `python scripts\warm_up.py` from `backend/`. It loads the sample project (TXT, CSV and DOCX) and waits
   until every agent has finished. You can also click **Load sample project** on the dashboard.
3. Open `http://localhost:5173`. The dashboard, agent outputs, health score and documents are already there.
4. Optional: upload one fresh file live to show incremental updates (see step 8 below).

With the hosted model the whole analysis finishes in roughly 15 seconds, so you can also run it live.

## Demo script: every milestone on screen

| Milestone | What to show | Where |
|---|---|---|
| **M1** Ingestion and RAG | Multi-format upload, document table with status, chunk counts, embedding model and vector collection | **Documents**, **Knowledge Base** |
| **M2** Scope, risk and blocker agents | Scope (goals, deliverables, milestones, responsibilities), risks with severity, mitigation and evidence, delivery forecast, blockers, pending decisions, action items | **AI Agents** |
| **M3** Documentation, health score, chat | User stories, risk register, action-item report (download as `.md`). Health score with an explained, dimension-wise breakdown. Chat questions such as "Are we on track?" and "What are our biggest risks?" with sources | **AI Agents**, **Project Health**, **AI Assistant** |
| **M4** Dashboard and incremental upload | Single-page dashboard: health gauge, risks, blockers, action items, scope summary. Drop in a new file and watch the dashboard refresh itself | **Dashboard** |

Suggested step 8 (incremental update): upload a short TXT such as "Update 20 Nov: SSO credentials are still pending,
the admin dashboard is now blocked for 2 weeks". The status banner shows indexing, then the analysis refreshing,
and the previous results stay visible meanwhile.

## Project scope control

Unrelated files (for example a research paper or an offer letter) would pollute the analysis.
Use the **In project** switch on the Documents page to exclude them. Excluded documents are skipped by the agents
and by the chat, and the analysis refreshes automatically.

## Architecture

```
React (Vite)  ──►  FastAPI  ──►  ChromaDB (vectors, built-in MiniLM embeddings)
                             └──►  LLM: Groq / Gemini / OpenAI-compatible, or Ollama
                      │
        background pool: extract → chunk → embed → index
                      │
        analysis pipeline (one run, cached): Scope → Risk → Blockers → Health → Documents
                      │
              analysis_cache.json  ──►  GET /api/dashboard (instant)
```

```
backend/
  main.py             API, ingestion, RAG chat, scheduling
  pipeline.py         Risk and blocker agents, user stories, orchestrator
  agents/scope_agent.py   Scope and deliverable extraction agent
  health_scorer.py    Explainable weighted health score (derived from the agent outputs)
  report_builders.py  Risk register, action items, summary, story fallback (rendered Markdown)
  evidence.py         Relevance-ranked evidence selection with per-document coverage
  store.py            Thread-safe persistent cache and pipeline state
  sample_data/        Multi-format sample project
  scripts/warm_up.py  Pre-demo loader
  llm.py              One entry point for all LLM calls (hosted or Ollama), retries, JSON repair
  embeddings.py       Local embedding model (or Ollama) and the matching Chroma collection
  tests/test_core.py  Unit tests (no network or Ollama needed)
frontend/src/
  App.jsx, hooks.js (live polling), api.js, components/ (Dashboard, AgentViews, HealthPage, ...)
```

### Health score

Derived from the agent outputs, never from keyword counts. Every deduction is listed on screen.

| Dimension | Weight | Based on |
|---|---|---|
| Scope clarity | 35 % | Which of objective, goals, deliverables, milestones, timeline and responsibilities are documented, minus reported information gaps |
| Timeline and risk | 40 % | Risk severity and category, plus the delivery forecast status |
| Blocker health | 25 % | Open blockers by priority, pending decisions, open actions without an owner |

Overall status: 75 and above Healthy, 50–74 At Risk, below 50 Critical. With no agent output the status is
"Insufficient Evidence" instead of an invented number.

## API

| Method and path | Purpose |
|---|---|
| `POST /api/documents/upload` | Accept files, return immediately, index in the background |
| `GET /api/documents` | List documents with status (`processing`, `processed`, `failed`) |
| `PATCH /api/documents/{id}` | Include or exclude a document from the project (`in_project`) |
| `DELETE /api/documents/{id}` | Remove a document and its vectors |
| `POST /api/demo/load` | Load the bundled sample project |
| `GET /api/dashboard` | Everything the dashboard needs, from cache |
| `POST /api/analysis/run`, `GET /api/analysis/status`, `GET /api/analysis` | Start, watch and read the analysis |
| `POST /api/agents/{scope,risk,blockers,documentation,health-score}` | Run or fetch a single agent (results are cached) |
| `POST /api/chat` | RAG question answering with sources |
| `GET /api/health` | Model and embedding status (cached, answers instantly) |

Interactive docs: `http://localhost:8000/docs`.

## Testing

Unit tests need no Ollama and no extra packages:

```bash
cd backend
python -m unittest discover -s tests -v
```

They cover health scoring, report rendering, JSON repair of truncated model output, evidence selection,
the cache and staleness logic, and the orchestrator (including partial and total agent failure).

End-to-end checklist (run once with your API key set):

| # | Test | Expected |
|---|---|---|
| 1 | Upload the sample TXT, CSV and DOCX together | Request returns at once; rows show "processing", then "processed" |
| 2 | `python scripts/warm_up.py` | Finishes and prints a health score |
| 3 | Restart the backend, reload the page | Dashboard still shows all results immediately |
| 4 | Upload one new TXT | Banner shows indexing, then refreshing; the old results stay visible |
| 5 | Exclude the unrelated PDF with the **In project** switch | Analysis refreshes and no longer mentions that file |
| 6 | Ask the assistant "Are we on track?" and "What are our biggest risks?" | Answers are based on the sample files and list their sources |
| 7 | Remove the API key from `.env`, restart, click **Refresh analysis** | Banner and agent tabs show "No API key configured"; previous results remain |
| 9 | Delete a document, or flip two "In project" switches quickly | The screen reacts at once; one analysis run follows |
| 8 | Download each generated document | `.md` files open with the expected tables |

## Known limitations

* Output quality depends on the local 3B model. Extraction can miss items or misjudge severity.
  Larger models give better results through `PROJECTIQ_CHAT_MODEL`.
* The hosted model needs internet access, and excerpts of the documents are sent to the provider.
* With the Ollama fallback on a CPU, an analysis takes minutes. With a hosted model it takes about 15 seconds.
  Free hosted plans have rate limits; the client retries automatically and a smaller model can be chosen.
* Scanned PDFs need OCR, which is not included.
* The chat is grounded by prompt and retrieval; it has no hard relevance threshold yet.

## Configuration (backend/.env or environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PROJECTIQ_API_KEY` | (empty) | Key for the hosted model. When set, the hosted model is used |
| `PROJECTIQ_LLM_PROVIDER` | `groq` if a key is set, else `ollama` | `groq`, `gemini`, `openai` (any OpenAI-compatible service) or `ollama` |
| `PROJECTIQ_CHAT_MODEL` | `llama-3.3-70b-versatile` (hosted), `llama3.2:3b` (Ollama) | Model name; use one your provider offers |
| `PROJECTIQ_API_BASE` | provider default | Base URL for `openai`-style services |
| `PROJECTIQ_EMBED_PROVIDER` | `local` | `local` (built-in model) or `ollama` |
| `PROJECTIQ_EMBED_MODEL` | `nomic-embed-text` | Ollama embedding model (only with `ollama` embeddings) |
| `PROJECTIQ_AGENT_CONTEXT_CHARS` | `11000` hosted / `7000` Ollama | Evidence characters given to each agent |
| `PROJECTIQ_LLM_SUMMARY` | `0` | Set to `1` for background LLM document summaries |
| `PROJECTIQ_NUM_CTX`, `PROJECTIQ_KEEP_ALIVE` | `4096`, `30m` | Ollama only |
| `VITE_API_URL` (frontend) | `http://localhost:8000` | Backend address |

Privacy note: with a hosted model, text excerpts of your documents are sent to that provider.
Use the Ollama setting if the documents must stay on your machine.

## Security and privacy (before you publish)

* **Never commit your API key.** Keep it only in `backend/.env`, which is listed in `.gitignore`.
  Commit `backend/.env.example` (it has no real values) so others know which variables to set.
* The backend reads the key with `python-dotenv` / environment variables; there is no key in the source code.
* Uploaded documents, the vector database and cached analysis (`backend/uploads/`, `backend/chroma_db/`,
  `backend/documents.json`, `backend/analysis_cache.json`) stay on your machine and are git-ignored.
* If a key is ever pushed by mistake, deleting the file is not enough (it stays in git history):
  revoke it in the provider console, create a new one and update your `.env`.
* When deploying (Render, Railway, Hugging Face Spaces, ...), set `PROJECTIQ_API_KEY` in the host's
  **environment variables / secrets** page, not in a file in the repo.
