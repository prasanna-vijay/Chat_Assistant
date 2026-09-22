# Chat Assistant

A chat UI with a model dropdown spanning three providers, each called directly with its own API key:

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

Then:
```
npm install
npm run dev
```
Open http://localhost:3000

## Notes

- Keys are only ever used server-side, in [app/api/chat/route.ts](app/api/chat/route.ts) — never sent to the browser. Each model in [lib/models.ts](lib/models.ts) carries an `apiProvider` (`gemini` | `groq` | `openrouter`) that the route uses to pick the right base URL and key.
- Chat history is stored in the browser's `localStorage`, not on a server.
- Parameter changes (model, temperature, etc.) are staged in the Parameters panel and only take effect after clicking **Save changes**.
- If a model is rate-limited (HTTP 429), the app automatically retries with the next free model in the list before giving up — you'll see a small "Answered by X" note under a reply if a fallback kicked in.
- Provider lineups drift often — verified against live APIs while building this (not just docs):
  - OpenRouter: `GET https://openrouter.ai/api/v1/models`, filter `id` ending in `:free`.
  - Groq: `GET https://api.groq.com/openai/v1/models` (needs your key) — `llama-3.1-8b-instant` (the original obvious "lite" pick) had already been retired.
  - Gemini: a `402 prepayment credits depleted` error from Google means the free tier isn't currently usable on that specific key/project — this is an account/billing state on Google's side, not an app bug. Check https://ai.studio/projects.
