import { NextRequest } from "next/server";
import { ApiProvider, MODELS } from "@/lib/models";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type ChatRequestBody = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
};

const PROVIDER_CONFIG: Record<
  ApiProvider,
  {
    label: string;
    baseUrl: string;
    envKey: string;
    extraHeaders?: Record<string, string>;
    // Which optional OpenAI-style params this provider's endpoint actually accepts.
    // Gemini's OpenAI-compatibility layer, despite its docs claiming unsupported
    // params are "silently ignored", hard-rejects unknown fields like
    // frequency_penalty/presence_penalty with a 400 — so those are left out for it.
    supportedParams: Set<string>;
  }
> = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    envKey: "OPENROUTER_API_KEY",
    extraHeaders: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Chat Assistant" },
    supportedParams: new Set(["temperature", "top_p", "max_tokens", "frequency_penalty", "presence_penalty", "stop"]),
  },
  gemini: {
    label: "Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    envKey: "GEMINI_API_KEY",
    supportedParams: new Set(["temperature", "top_p", "max_tokens", "stop"]),
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    envKey: "GROQ_API_KEY",
    supportedParams: new Set(["temperature", "top_p", "max_tokens", "frequency_penalty", "presence_penalty", "stop"]),
  },
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequestBody;

  if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "Request must include `model` and a non-empty `messages` array." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const modelOption = MODELS.find((m) => m.id === body.model);
  if (!modelOption) {
    return new Response(JSON.stringify({ error: `Unknown model: ${body.model}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = PROVIDER_CONFIG[modelOption.apiProvider];
  const apiKey = process.env[config.envKey];
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: `${config.envKey} is not set. Add it to .env.local and restart the dev server.` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const candidateParams: Record<string, unknown> = {
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_tokens,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
    stop: body.stop && body.stop.length > 0 ? body.stop : undefined,
  };
  const allowedParams = Object.fromEntries(
    Object.entries(candidateParams).filter(([key]) => config.supportedParams.has(key))
  );

  const upstream = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...config.extraHeaders,
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      stream: true,
      ...allowedParams,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text().catch(() => "");
    return new Response(JSON.stringify({ error: extractErrorMessage(config.label, upstream.status, raw) }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Re-stream the upstream SSE response straight through to the client.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Error bodies are OpenAI-shaped across all three providers: { "error": { "message": "...",
// "metadata": { "raw": "human readable detail", "retry_after_seconds": 5 } } } (the `metadata`
// block is an OpenRouter extension; Gemini/Groq just have `message`). Gemini additionally
// wraps the whole thing in an array: [{ "error": { ... } }]. Pull out the human-readable
// parts instead of surfacing raw nested JSON to the UI.
function extractErrorMessage(providerLabel: string, status: number, raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const err = first?.error ?? first;
    const detail: string | undefined = err?.metadata?.raw ?? err?.message;
    if (!detail) return `${providerLabel} error (${status})`;
    const retryAfter = err?.metadata?.retry_after_seconds;
    return retryAfter ? `${detail} (retry in ~${retryAfter}s)` : detail;
  } catch {
    return raw ? `${providerLabel} error (${status}): ${raw}` : `${providerLabel} error (${status})`;
  }
}
