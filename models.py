# Which upstream API a model is called through. "openrouter" models all share
# one OpenRouter key; "gemini" and "groq" call those providers' own APIs
# directly with their own keys — see providers.py for the routing.
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ModelOption:
    id: str  # model id as sent to that provider's API
    label: str
    provider: str  # "Google" | "Qwen" | "Liquid" | "NVIDIA" | "Gemini" | "Groq"
    api_provider: str  # "openrouter" | "gemini" | "groq"


# OpenRouter free ($0/M tokens) variants (https://openrouter.ai/models?max_price=0).
# OpenRouter's free catalog turns over often and can retire slugs without notice —
# OpenAI and Mistral currently have no free models there at all, so this list is
# picked from whichever providers do.
# To refresh: GET https://openrouter.ai/api/v1/models (no auth needed) and filter
# for `id` ending in ":free".
OPENROUTER_MODELS = [
    ModelOption("google/gemma-4-31b-it:free", "Gemma 4 31B", "Google", "openrouter"),
    ModelOption("google/gemma-4-26b-a4b-it:free", "Gemma 4 26B", "Google", "openrouter"),
    ModelOption("qwen/qwen3.8-27b:free", "Qwen3.8 27B", "Qwen", "openrouter"),
    ModelOption("liquid/lfm-2.5-2.6b:free", "LFM2.5 2.6B", "Liquid", "openrouter"),
    ModelOption("nvidia/nemotron-3-super-120b-a12b:free", "Nemotron 3 Super", "NVIDIA", "openrouter"),
]

# Native Gemini API, called directly with GEMINI_API_KEY via Google's
# OpenAI-compatibility endpoint. gemini-3.5-flash-lite is free of charge on
# the free tier as of writing (https://ai.google.dev/gemini-api/docs/pricing).
GEMINI_MODELS = [
    ModelOption("gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", "Gemini", "gemini"),
]

# Native Groq API, called directly with GROQ_API_KEY. Groq's developer/free
# tier covers this model with generous rate limits (https://console.groq.com/docs/rate-limits).
# Verified against GET https://api.groq.com/openai/v1/models — Groq's lineup turns over
# often (llama-3.1-8b-instant, an earlier "lite" pick, has already been retired).
GROQ_MODELS = [
    ModelOption("openai/gpt-oss-20b", "GPT-OSS 20B", "Groq", "groq"),
]

MODELS = [*GEMINI_MODELS, *GROQ_MODELS, *OPENROUTER_MODELS]

DEFAULT_MODEL = "gemini-3.5-flash-lite"

# Display order for grouping models by provider in the UI.
PROVIDER_ORDER = ["Gemini", "Groq", "Google", "Qwen", "Liquid", "NVIDIA"]


def model_by_id(model_id: str) -> Optional[ModelOption]:
    return next((m for m in MODELS if m.id == model_id), None)
