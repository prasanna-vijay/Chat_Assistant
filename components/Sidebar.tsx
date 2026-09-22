"use client";

import { Conversation } from "@/lib/types";

function groupLabel(updatedAt: number): string {
  const now = new Date();
  const date = new Date(updatedAt);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Previous 7 days";
  return "Older";
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
  open,
  onClose,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const groups = new Map<string, Conversation[]>();
  for (const c of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const label = groupLabel(c.updatedAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }
  const order = ["Today", "Yesterday", "Previous 7 days", "Older"];

  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed z-30 flex h-full w-64 flex-col border-r border-neutral-800 bg-neutral-950 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 p-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500 text-sm font-bold text-black">
            C
          </div>
          <span className="text-sm font-semibold text-neutral-200">Chat Assistant</span>
        </div>

        <div className="p-3">
          <button
            onClick={onNewChat}
            className="w-full rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-black transition hover:bg-orange-400"
          >
            + New chat
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {order
            .filter((label) => groups.has(label))
            .map((label) => (
              <div key={label} className="mb-3">
                <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  {label}
                </div>
                {groups.get(label)!.map((c) => (
                  <div
                    key={c.id}
                    className={`group flex items-center justify-between rounded-md px-2 py-2 text-sm cursor-pointer ${
                      c.id === activeId
                        ? "bg-neutral-800 text-neutral-100"
                        : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                    }`}
                    onClick={() => onSelect(c.id)}
                  >
                    <span className="truncate">{c.title || "New chat"}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      className="ml-2 hidden shrink-0 text-neutral-500 hover:text-red-400 group-hover:block"
                      aria-label="Delete chat"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ))}
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-sm text-neutral-600">No chats yet. Start a new one above.</p>
          )}
        </nav>

        <div className="border-t border-neutral-800 p-3 text-[11px] text-neutral-500">
          Free-tier models via OpenRouter
        </div>
      </aside>
    </>
  );
}
