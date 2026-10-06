import json
import os
from typing import Iterator, Optional

import requests

from models import ModelOption

PROVIDER_CONFIG = {
    "openrouter": {
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1/chat/completions",
        "env_key": "OPENROUTER_API_KEY",
        "extra_headers": {"HTTP-Referer": "http://localhost:7860", "X-Title": "Chat Assistant"},
        "supported_params": {"temperature", "top_p", "max_tokens", "frequency_penalty", "presence_penalty", "stop"},
    },
    "gemini": {
        "label": "Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "env_key": "GEMINI_API_KEY",
        "extra_headers": {},
        # Gemini's OpenAI-compatibility layer, despite its docs claiming unsupported
        # params are "silently ignored", hard-rejects unknown fields like
        # frequency_penalty/presence_penalty with a 400 — so those are left out for it.
        "supported_params": {"temperature", "top_p", "max_tokens", "stop"},
    },
    "groq": {
        "label": "Groq",
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "env_key": "GROQ_API_KEY",
        "extra_headers": {},
        "supported_params": {"temperature", "top_p", "max_tokens", "frequency_penalty", "presence_penalty", "stop"},
    },
}


class ProviderError(Exception):
    pass


# Error bodies are OpenAI-shaped across all three providers: { "error": { "message": "...",
# "metadata": { "raw": "human readable detail", "retry_after_seconds": 5 } } } (the `metadata`
# block is an OpenRouter extension; Gemini/Groq just have `message`). Gemini additionally
# wraps the whole thing in an array: [{ "error": { ... } }]. Pull out the human-readable
# parts instead of surfacing raw nested JSON to the UI.
def extract_error_message(provider_label: str, status: int, raw: str) -> str:
    try:
        parsed = json.loads(raw)
        first = parsed[0] if isinstance(parsed, list) else parsed
        err = first.get("error", first) if isinstance(first, dict) else first
        detail = None
        retry_after = None
        if isinstance(err, dict):
            metadata = err.get("metadata") or {}
            detail = metadata.get("raw") or err.get("message")
            retry_after = metadata.get("retry_after_seconds")
        if not detail:
            return f"{provider_label} error ({status})"
        return f"{detail} (retry in ~{retry_after}s)" if retry_after else detail
    except Exception:
        return f"{provider_label} error ({status}): {raw}" if raw else f"{provider_label} error ({status})"


def open_stream(model: ModelOption, messages: list[dict], params: dict) -> requests.Response:
    """Sends the chat completion request and returns the still-open streaming
    response. Raises ProviderError if the upstream call fails before any
    streaming starts (missing key, non-2xx response, connection failure)."""
    config = PROVIDER_CONFIG[model.api_provider]
    api_key = os.environ.get(config["env_key"])
    if not api_key:
        raise ProviderError(f"{config['env_key']} is not set. Add it to .env.local and restart the app.")

    candidate_params = {
        "temperature": params.get("temperature"),
        "top_p": params.get("top_p"),
        "max_tokens": params.get("max_tokens"),
        "frequency_penalty": params.get("frequency_penalty"),
        "presence_penalty": params.get("presence_penalty"),
        "stop": params.get("stop") or None,
    }
    allowed_params = {
        key: value
        for key, value in candidate_params.items()
        if key in config["supported_params"] and value is not None
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **config["extra_headers"],
    }
    payload = {"model": model.id, "messages": messages, "stream": True, **allowed_params}

    try:
        resp = requests.post(config["base_url"], headers=headers, json=payload, stream=True, timeout=60)
    except requests.RequestException as exc:
        raise ProviderError(f"{config['label']} request failed: {exc}") from exc

    if not resp.ok:
        raw = resp.text
        resp.close()
        raise ProviderError(extract_error_message(config["label"], resp.status_code, raw))

    return resp


def iter_deltas(resp: requests.Response) -> Iterator[str]:
    """Reads an open SSE streaming response and yields each text delta."""
    try:
        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            payload = line[len("data:"):].strip()
            if payload == "[DONE]":
                continue
            try:
                chunk = json.loads(payload)
                delta: Optional[str] = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
            except Exception:
                # Ignore malformed/partial SSE chunks.
                continue
            if delta:
                yield delta
    finally:
        resp.close()
