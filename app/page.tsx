"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ParamsPanel from "@/components/ParamsPanel";
import ChatWindow from "@/components/ChatWindow";
import { loadConversations, saveConversations } from "@/lib/storage";
import { ChatMessage, ChatParams, Conversation } from "@/lib/types";
import { DEFAULT_MODEL, MODELS } from "@/lib/models";

const DEFAULT_PARAMS: ChatParams = {
  model: DEFAULT_MODEL,
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: "",
};

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [params, setParams] = useState<ChatParams>(DEFAULT_PARAMS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time read across the server/client boundary: localStorage doesn't exist during
    // SSR, so state must start empty and hydrate from it after mount.
    const stored = loadConversations();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(stored);
    if (stored.length > 0) setActiveId(stored[0].id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveConversations(conversations);
  }, [conversations, hydrated]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const messages = active?.messages ?? [];

  const handleNewChat = () => {
    setActiveId(null);
    setError(null);
    setSidebarOpen(false);
  };

  const handleDelete = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const handleSend = async (text: string) => {
    setError(null);
    const userMsg: ChatMessage = { id: newId(), role: "user", content: text };
    const assistantMsg: ChatMessage = { id: newId(), role: "assistant", content: "" };

    let conversationId = activeId;
    let historyForRequest: ChatMessage[];

    if (conversationId) {
      historyForRequest = [...(conversations.find((c) => c.id === conversationId)?.messages ?? []), userMsg];
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, messages: [...c.messages, userMsg, assistantMsg], updatedAt: Date.now() }
            : c
        )
      );
    } else {
      conversationId = newId();
      historyForRequest = [userMsg];
      const title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
      const conversation: Conversation = {
        id: conversationId,
        title,
        messages: [userMsg, assistantMsg],
        updatedAt: Date.now(),
      };
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversationId);
    }

    setIsStreaming(true);
    const targetId = conversationId;

    const requestBody = (model: string) =>
      JSON.stringify({
        model,
        messages: historyForRequest.map((m) => ({ role: m.role, content: m.content })),
        temperature: params.temperature,
        top_p: params.topP,
        max_tokens: params.maxTokens,
        frequency_penalty: params.frequencyPenalty,
        presence_penalty: params.presencePenalty,
        stop: params.stop
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });

    // Try the selected model first, then fall back through the rest of the free model
    // list on any failure — errors are often provider-specific (rate limits, a missing
    // key for just that provider, a param one API rejects) rather than something that
    // would fail identically for every model, so it's worth trying them all.
    const candidates = [params.model, ...MODELS.map((m) => m.id).filter((id) => id !== params.model)];
    let lastErrorMessage: string | null = null;

    try {
      let succeeded = false;

      for (const model of candidates) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody(model),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
          lastErrorMessage = data.error ?? `Request failed (${res.status})`;
          continue;
        }

        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetId
              ? { ...c, messages: c.messages.map((m) => (m.id === assistantMsg.id ? { ...m, respondedModel: model } : m)) }
              : c
          )
        );

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content ?? "";
              if (delta) {
                content += delta;
                const snapshot = content;
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === targetId
                      ? {
                          ...c,
                          messages: c.messages.map((m) =>
                            m.id === assistantMsg.id ? { ...m, content: snapshot } : m
                          ),
                        }
                      : c
                  )
                );
              }
            } catch {
              // Ignore malformed/partial SSE chunks.
            }
          }
        }

        succeeded = true;
        break;
      }

      if (!succeeded) {
        throw new Error(
          lastErrorMessage
            ? `All models failed. Last error: ${lastErrorMessage}`
            : "All models are currently unavailable. Try again shortly."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-neutral-950">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
          setError(null);
        }}
        onNewChat={handleNewChat}
        onDelete={handleDelete}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <ChatWindow
        messages={messages}
        modelId={params.model}
        isStreaming={isStreaming}
        error={error}
        onSend={handleSend}
        onOpenSidebar={() => setSidebarOpen(true)}
        onOpenParams={() => setParamsOpen(true)}
      />
      <ParamsPanel params={params} onSave={setParams} open={paramsOpen} onClose={() => setParamsOpen(false)} />
    </div>
  );
}
