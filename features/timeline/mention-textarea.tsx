"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Popover, PopoverContent } from "@/components/_ui/popover";
import Avatar from "@/components/_ui/avatar";
import { useMembers, useViewer } from "@/hooks/use-viewer";
import {
  activeMention,
  decodeMentions,
  encodeMentions,
  insertMention,
  matchesMention,
  type MentionPick,
} from "@/lib/domain/mentions";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

const MAX_OPTIONS = 6;

/** Text being written plus the members picked from the `@` menu; `encoded()` is what to save. */
export function useMentionDraft(initial = "", mentioned: MentionPick[] = []) {
  const [state, setState] = useState(() => seed(initial, mentioned));
  const encoded = useCallback(
    () => encodeMentions(state.text, state.picks).trim(),
    [state],
  );
  return {
    text: state.text,
    picks: state.picks,
    setText: (text: string) => setState((current) => ({ ...current, text })),
    addPick: (pick: MentionPick) =>
      setState((current) => ({
        ...current,
        picks: current.picks.some((item) => item.id === pick.id)
          ? current.picks
          : [...current.picks, pick],
      })),
    reset: (body = "", people: MentionPick[] = []) =>
      setState(seed(body, people)),
    encoded,
  };
}

export type MentionDraft = ReturnType<typeof useMentionDraft>;

function seed(body: string, mentioned: MentionPick[]) {
  const names = new Map(mentioned.map((pick) => [pick.id, pick.name]));
  return decodeMentions(body, (id) => names.get(id));
}

const MIRRORED = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "tabSize",
] as const;

/** Where `index` sits inside the textarea, measured with an off-screen copy of it. */
function caretPoint(textarea: HTMLTextAreaElement, index: number) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  for (const key of MIRRORED) mirror.style[key] = style[key];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight =
    parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
  const point = {
    top:
      textarea.offsetTop + marker.offsetTop - textarea.scrollTop + lineHeight,
    left: textarea.offsetLeft + marker.offsetLeft - textarea.scrollLeft,
  };
  mirror.remove();
  return point;
}

type Props = Omit<ComponentProps<"textarea">, "value" | "onChange"> & {
  draft: MentionDraft;
};

/** A textarea where `@` opens a menu of teammates to mention. */
export default function MentionTextarea({
  draft,
  onKeyDown,
  className,
  ...props
}: Props) {
  const members = useMembers();
  const viewer = useViewer();
  const listId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [point, setPoint] = useState({ top: 0, left: 0 });
  const [active, setActive] = useState(0);
  const pendingCaret = useRef<number | null>(null);

  // Placed after React writes the new value, before the next keystroke lands.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.setSelectionRange(caret, caret);
  });

  const options = useMemo(() => {
    if (!query || !members) return [];
    return members
      .filter((member) => member._id !== viewer._id)
      .filter((member) => matchesMention(member, query.query))
      .slice(0, MAX_OPTIONS);
  }, [members, query, viewer._id]);
  const open = query !== null && options.length > 0;
  const current = Math.min(active, Math.max(0, options.length - 1));

  function sync(element: HTMLTextAreaElement) {
    const caret = element.selectionStart ?? element.value.length;
    const next =
      element.selectionStart === element.selectionEnd
        ? activeMention(element.value, caret)
        : null;
    if (next?.start !== query?.start || next?.query !== query?.query) {
      setQuery(next);
      setActive(0);
    }
    if (next) setPoint(caretPoint(element, next.start));
  }

  function choose(member: { _id: string; name: string }) {
    const element = ref.current;
    if (!element || !query) return;
    const caret = element.selectionStart ?? element.value.length;
    const result = insertMention(
      draft.text,
      { start: query.start, end: caret },
      member.name,
    );
    draft.addPick({ id: member._id, name: member.name });
    draft.setText(result.text);
    setQuery(null);
    pendingCaret.current = result.caret;
    element.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((current + step + options.length) % options.length);
        return;
      }
      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        choose(options[current]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setQuery(null);
        return;
      }
    }
    onKeyDown?.(event);
  }

  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <Popover open={open} onOpenChange={(next) => !next && setQuery(null)}>
      <div className="relative">
        <PopoverPrimitive.Anchor asChild>
          <span
            aria-hidden
            className="pointer-events-none absolute size-0"
            style={{ top: point.top, left: point.left }}
          />
        </PopoverPrimitive.Anchor>
        <textarea
          {...props}
          ref={ref}
          value={draft.text}
          onChange={(event) => {
            draft.setText(event.target.value);
            sync(event.target);
          }}
          onSelect={(event) => sync(event.currentTarget)}
          onBlur={(event) => {
            props.onBlur?.(event);
            setQuery(null);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? optionId(current) : undefined}
          className={className}
        />
      </div>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === ref.current) event.preventDefault();
        }}
        className="w-64 p-1"
      >
        <ul id={listId} role="listbox" aria-label="Mention a teammate">
          {options.map((member, index) => (
            <li
              key={member._id}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(member)}
              className={cn(
                "text-fg-secondary duration-fast flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                index === current && "bg-overlay-2 text-foreground",
              )}
            >
              <Avatar name={member.name} size="sm" />
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
              <span className="caption-style text-fg-tertiary shrink-0">
                {ROLE_LABEL[member.role]}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
