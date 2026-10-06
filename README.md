# Chat Assistant

A Gradio chat UI with a model dropdown spanning three providers, each called directly with its own API key:

- **Gemini** (Google, native API) — `gemini-3.5-flash-lite`, free tier
- **Groq** (native API) — `openai/gpt-oss-20b`, on Groq's free developer tier
- **OpenRouter** — a grab-bag of whatever's currently free ($0/M tokens) there: Gemma, Qwen, GLM, Nemotron

The dropdown was originally scoped to OpenAI/Gemini/Mistral/Qwen through OpenRouter alone, but OpenRouter's free catalog turned out to have no free OpenAI or Mistral models, and free "Gemini" there was actually Gemma. Gemini and Groq were added as direct integrations instead, since both have real, genuinely-branded free tiers.

## Setup

Each provider needs its own key in `.env.local` (already gitignored). You only need the keys for providers whose models you'll actually use.

```
OPENROUTER_API_KEY=sk-or-v1-...   # https://openrouter.ai/keys
GEMINI_API_KEY=...                # https://aistudio.google.com/apikey
GROQ_API_KEY=gsk_...              # https://console.groq.com/keys
```

For the document upload / RAG feature (optional), also set:
```
QDRANT_URL=...                    # https://cloud.qdrant.io/ (free cluster), or a local instance
QDRANT_API_KEY=...                # leave blank for a local/unauthenticated instance
QDRANT_COLLECTION_NAME=chat_assistant_docs
```

Then:
```
python -m venv .venv
.venv\Scripts\activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:7860

## Document upload / RAG

Upload a PDF in the sidebar's "Knowledge base" section to index it:
1. [ingestion.py](ingestion.py) loads it page-by-page with LangChain's `PyPDFLoader` (one chunk per page, no further splitting).
2. Each page is embedded with Gemini's `gemini-embedding-001` (truncated to 768 dimensions) — the only embedding model among the three free providers here.
3. Chunks are upserted into a Qdrant collection (`QDRANT_COLLECTION_NAME`), created automatically on first use.

Once something's indexed, every chat message runs a similarity search first; matching excerpts are injected as hidden context for the model. If the uploaded document doesn't answer the question, the model says so explicitly (e.g. "I couldn't find this in your uploaded document...") before falling back to its own general knowledge — so RAG and plain chat blend seamlessly. A "Document excerpts checked" footer lists which pages were considered.

## Notes

- Keys are only ever read server-side in [providers.py](providers.py) — never sent to the browser. Each model in [models.py](models.py) carries an `api_provider` (`gemini` | `groq` | `openrouter`) that `providers.open_stream` uses to pick the right base URL and key.
- Chat history, the active conversation, and saved parameters are stored in the browser via Gradio's `BrowserState` (backed by `localStorage`), not on a server — see the `gr.BrowserState(...)` calls in [app.py](app.py).
- Parameter changes (model, temperature, etc.) are staged in the Parameters panel and only take effect after clicking **Save changes**.
- If a model is rate-limited (HTTP 4xx/5xx before streaming starts), the app automatically retries with the next free model in the list before giving up — you'll see a small "Answered by X" note under a reply if a fallback kicked in.
- Provider lineups drift often — verified against live APIs while building this (not just docs):
  - OpenRouter: `GET https://openrouter.ai/api/v1/models`, filter `id` ending in `:free`.
  - Groq: `GET https://api.groq.com/openai/v1/models` (needs your key) — `llama-3.1-8b-instant` (the original obvious "lite" pick) had already been retired.
  - Gemini: a `402 prepayment credits depleted` error from Google means the free tier isn't currently usable on that specific key/project — this is an account/billing state on Google's side, not an app bug. Check https://ai.studio/projects.
