"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";
import { MODELS } from "@/lib/models";

export default function ChatWindow({
  messages,
  modelId,
  isStreaming,
  error,
  onSend,
  onOpenSidebar,
  onOpenParams,
}: {
  messages: ChatMessage[];
  modelId: string;
  isStreaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onOpenSidebar: () => void;
  onOpenParams: () => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelLabel = MODELS.find((m) => m.id === modelId)?.label ?? modelId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="flex h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSidebar}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-900 md:hidden"
            aria-label="Open chat history"
          >
            ☰
          </button>
          <h1 className="text-sm font-semibold text-neutral-200">Chat Assistant</h1>
          <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400">
            {modelLabel}
          </span>
        </div>
        <button
          onClick={onOpenParams}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-900 lg:hidden"
          aria-label="Open parameters"
        >
          ⚙
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-neutral-600">
              Pick a model on the right and send a message to get started.
            </p>
          )}
          {messages.map((m) => {
            const respondedLabel = m.respondedModel
              ? MODELS.find((model) => model.id === m.respondedModel)?.label ?? m.respondedModel
              : null;
            const isFallback = m.respondedModel && m.respondedModel !== modelId;
            return (
              <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-orange-500/15 text-orange-50 border border-orange-500/30"
                      : "bg-neutral-900 text-neutral-100 border border-neutral-800"
                  }`}
                >
                  {m.content || (isStreaming && m.role === "assistant" ? "…" : "")}
                </div>
                {isFallback && respondedLabel && (
                  <span className="mt-1 px-1 text-[11px] text-neutral-500">
                    Answered by {respondedLabel} (your selected model was rate-limited)
                  </span>
                )}
              </div>
            );
          })}
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-neutral-800 p-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message the assistant..."
            rows={1}
            className="max-h-40 flex-1 resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={!input.trim() || isStreaming}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isStreaming ? "…" : "Send"}
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-neutral-600">
          Enter to send, Shift+Enter for a new line · Free-tier models can be rate-limited or unavailable at times.
        </p>
      </div>
    </div>
  );
}
