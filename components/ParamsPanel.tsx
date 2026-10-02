"use client";

import { useState } from "react";
import { MODELS } from "@/lib/models";
import { ChatParams } from "@/lib/types";

const PROVIDERS = ["Gemini", "Groq", "Google", "Qwen", "Liquid", "NVIDIA"] as const;

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wide text-neutral-400">{label}</span>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-orange-500"
      />
      <div className="mt-0.5 flex justify-between text-[10px] text-neutral-600">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function paramsEqual(a: ChatParams, b: ChatParams) {
  return (
    a.model === b.model &&
    a.temperature === b.temperature &&
    a.topP === b.topP &&
    a.maxTokens === b.maxTokens &&
    a.frequencyPenalty === b.frequencyPenalty &&
    a.presencePenalty === b.presencePenalty &&
    a.stop === b.stop
  );
}

export default function ParamsPanel({
  params,
  onSave,
  open,
  onClose,
}: {
  params: ChatParams;
  onSave: (params: ChatParams) => void;
  open: boolean;
  onClose: () => void;
}) {
  // Edits are staged locally and only take effect (i.e. flow into the next chat request)
  // once "Save changes" is clicked — they don't need to stay in sync with `params` beyond
  // the initial value, since the only way `params` changes elsewhere is via this save.
  const [draft, setDraft] = useState<ChatParams>(params);
  const set = <K extends keyof ChatParams>(key: K, value: ChatParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const isDirty = !paramsEqual(draft, params);

  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed right-0 z-30 flex h-full w-72 flex-col border-l border-neutral-800 bg-neutral-950 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-200">Parameters</h2>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Model
            </label>
            <select
              value={draft.model}
              onChange={(e) => set("model", e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 focus:border-orange-500 focus:outline-none"
            >
              {PROVIDERS.map((provider) => (
                <optgroup key={provider} label={provider}>
                  {MODELS.filter((m) => m.provider === provider).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <Slider
            label="Temperature"
            value={draft.temperature}
            min={0}
            max={2}
            step={0.1}
            onChange={(v) => set("temperature", v)}
          />
          <Slider label="Top P" value={draft.topP} min={0} max={1} step={0.05} onChange={(v) => set("topP", v)} />

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Max tokens
            </label>
            <input
              type="number"
              min={1}
              max={8192}
              value={draft.maxTokens}
              onChange={(e) => set("maxTokens", Number(e.target.value))}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <Slider
            label="Frequency penalty"
            value={draft.frequencyPenalty}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => set("frequencyPenalty", v)}
          />
          <Slider
            label="Presence penalty"
            value={draft.presencePenalty}
            min={-2}
            max={2}
            step={0.1}
            onChange={(v) => set("presencePenalty", v)}
          />

          <div className="mb-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Stop sequences
            </label>
            <input
              type="text"
              placeholder="comma, separated"
              value={draft.stop}
              onChange={(e) => set("stop", e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-neutral-800 p-4">
          <button
            onClick={() => onSave(draft)}
            disabled={!isDirty}
            className="w-full rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </aside>
    </>
  );
}
