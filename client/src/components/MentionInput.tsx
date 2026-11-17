import React, { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MentionUser = { id: number; name: string | null; username: string };

const displayName = (user: MentionUser) => (user.name || user.username || "").trim();

/** Trecho "@algo" logo antes do cursor (o que a pessoa está digitando). */
function mentionAtCaret(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(before);
  if (!match) return null;
  return { query: match[2], start: before.length - match[2].length - 1 };
}

/**
 * Campo de comentário com menções: ao digitar "@" aparece a lista de pessoas da
 * empresa do quadro. A escolha vira "@Nome" no texto e é registrada em onPick.
 */
export function MentionTextarea({
  value,
  onChange,
  users,
  onPick,
  excludeId,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
  onPick: (user: MentionUser) => void;
  excludeId?: number;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(() => {
    if (!active) return [];
    const q = active.query.toLowerCase();
    return users
      .filter((u) => u.id !== excludeId)
      .filter((u) => !q || displayName(u).toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 6);
  }, [active, users, excludeId]);

  const refresh = (text: string, caret: number) => {
    const found = mentionAtCaret(text, caret);
    setActive(found);
    setHighlight(0);
  };

  const pick = (user: MentionUser) => {
    if (!active) return;
    const name = displayName(user);
    const caret = ref.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, active.start)}@${name} ${value.slice(caret)}`;
    onChange(next);
    onPick(user);
    setActive(null);
    const position = active.start + name.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(position, position);
    });
  };

  const open = !!active && suggestions.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        className={className}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? "mention-list" : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          refresh(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => refresh(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setTimeout(() => setActive(null), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(suggestions[highlight]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setActive(null);
          }
        }}
      />
      {open && (
        <ul
          id="mention-list"
          role="listbox"
          aria-label="Mencionar pessoa"
          className="absolute left-3 top-full z-50 mt-1 w-64 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-[var(--shadow-pop)]"
        >
          {suggestions.map((user, index) => (
            <li
              key={user.id}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(user);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={cn(
                "flex cursor-pointer flex-col px-3 py-1.5 text-sm",
                index === highlight ? "bg-foreground/[0.08]" : ""
              )}
            >
              <span className="font-medium text-foreground">{displayName(user)}</span>
              <span className="truncate text-xs text-muted-foreground">{user.username}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** IDs das pessoas escolhidas que continuam mencionadas no texto final. */
export function mentionIdsIn(text: string, picked: MentionUser[]): number[] {
  return Array.from(new Set(picked.filter((u) => text.includes(`@${displayName(u)}`)).map((u) => u.id)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Texto de comentário com as menções destacadas. */
export function MentionText({ text, users }: { text: string; users: MentionUser[] }) {
  const parts = useMemo(() => {
    const names = Array.from(new Set(users.map(displayName).filter((n) => n.length > 0))).sort((a, b) => b.length - a.length);
    if (names.length === 0) return [text];
    const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join("|")}))`, "g");
    return text.split(pattern);
  }, [text, users]);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="rounded bg-primary/15 px-1 font-medium text-foreground">
            {part}
          </span>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
