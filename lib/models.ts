// Which upstream API a model is called through. "openrouter" models all share
// one OpenRouter key; "gemini" and "groq" call those providers' own APIs
// directly with their own keys — see app/api/chat/route.ts for the routing.
export type ApiProvider = "openrouter" | "gemini" | "groq";

export type ModelOption = {
  id: string; // model id as sent to that provider's API
  label: string;
  provider: "Google" | "Qwen" | "Liquid" | "NVIDIA" | "Gemini" | "Groq";
  apiProvider: ApiProvider;
};

// OpenRouter free ($0/M tokens) variants (https://openrouter.ai/models?max_price=0).
// OpenRouter's free catalog turns over often and can retire slugs without notice —
// OpenAI and Mistral currently have no free models there at all, so this list is
// picked from whichever providers do.
// To refresh: GET https://openrouter.ai/api/v1/models (no auth needed) and filter
// for `id` ending in ":free".
const OPENROUTER_MODELS: ModelOption[] = [
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", provider: "Google", apiProvider: "openrouter" },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Gemma 4 26B", provider: "Google", apiProvider: "openrouter" },
  { id: "qwen/qwen3.8-27b:free", label: "Qwen3.8 27B", provider: "Qwen", apiProvider: "openrouter" },
  { id: "liquid/lfm-2.5-2.6b:free", label: "LFM2.5 2.6B", provider: "Liquid", apiProvider: "openrouter" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super", provider: "NVIDIA", apiProvider: "openrouter" },
];

// Native Gemini API, called directly with GEMINI_API_KEY via Google's
// OpenAI-compatibility endpoint. gemini-3.5-flash-lite is free of charge on
// the free tier as of writing (https://ai.google.dev/gemini-api/docs/pricing).
const GEMINI_MODELS: ModelOption[] = [
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", provider: "Gemini", apiProvider: "gemini" },
];

// Native Groq API, called directly with GROQ_API_KEY. Groq's developer/free
// tier covers this model with generous rate limits (https://console.groq.com/docs/rate-limits).
// Verified against GET https://api.groq.com/openai/v1/models — Groq's lineup turns over
// often (llama-3.1-8b-instant, an earlier "lite" pick, has already been retired).
const GROQ_MODELS: ModelOption[] = [
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", provider: "Groq", apiProvider: "groq" },
];

export const MODELS: ModelOption[] = [...GEMINI_MODELS, ...GROQ_MODELS, ...OPENROUTER_MODELS];

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
