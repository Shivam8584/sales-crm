"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Input } from "@/components/_ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/_ui/popover";
import {
  VARIABLE_GROUPS,
  templateIssues,
  variablesFor,
  type SubjectKind,
} from "@/lib/domain/automations";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";

/** Section heading inside the side panel. */
export function PanelSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1">
        <h3 className="text-fg-tertiary text-xs leading-4">{title}</h3>
        {description && (
          <p className="caption-style text-fg-tertiary leading-snug">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Multi-select as toggle pills; an empty selection means "any". */
export function ChoicePills({
  label,
  options,
  value,
  onChange,
  disabled,
  anyLabel,
  single,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  /** Shown as the first pill; selecting it clears the list. */
  anyLabel?: string;
  single?: boolean;
}) {
  const toggle = (option: string) => {
    if (single) return onChange([option]);
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );
  };
  const pill =
    "border-border text-fg-secondary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring aria-pressed:border-selected aria-pressed:bg-selected/12 aria-pressed:text-foreground duration-fast inline-flex h-7 cursor-pointer items-center rounded-full border px-2.5 text-xs leading-none font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60";
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {anyLabel && (
        <button
          type="button"
          aria-pressed={value.length === 0}
          disabled={disabled}
          onClick={() => onChange([])}
          className={pill}
        >
          {anyLabel}
        </button>
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value.includes(option.value)}
          disabled={disabled}
          onClick={() => toggle(option.value)}
          className={pill}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Text input or textarea with a picker that inserts `{{variables}}` at the cursor. */
export function TemplateInput({
  id,
  value,
  onChange,
  multiline,
  placeholder,
  disabled,
  invalid,
  rows = 6,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  rows?: number;
}) {
  const { automation } = useEditor();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const issues = templateIssues(value, automation.subjectKind);
  const insert = (name: string) => {
    const element = ref.current;
    const token = `{{${name}}}`;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const common = {
    id,
    ref,
    value,
    placeholder,
    disabled,
    "aria-invalid": invalid || issues.length > 0 || undefined,
    onChange: (event: { target: { value: string } }) =>
      onChange(event.target.value),
  };
  return (
    <div className="flex flex-col gap-1.5">
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          className="bg-well text-foreground placeholder:text-fg-tertiary focus-visible:ring-foreground/15 hover:bg-well-hover aria-invalid:ring-danger/40 duration-fast w-full resize-y rounded-xl px-3 py-2 text-sm leading-relaxed transition-[background-color,box-shadow] outline-none focus-visible:ring-2 disabled:opacity-60 aria-invalid:ring-2"
        />
      ) : (
        <Input {...common} className="aria-invalid:border-danger" />
      )}
      {!disabled && (
        <VariablePicker subject={automation.subjectKind} onPick={insert} />
      )}
    </div>
  );
}

/** Searchable list of the variables a record of this kind can fill. */
function VariablePicker({
  subject,
  onPick,
}: {
  subject: SubjectKind;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);
  const variables = variablesFor(subject);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="text-fg-tertiary hover:text-foreground hover:bg-overlay-2 data-[state=open]:bg-overlay-2 data-[state=open]:text-foreground focus-visible:ring-ring duration-fast inline-flex h-6 items-center gap-1 self-start rounded-md px-1.5 font-mono text-xs leading-4 transition-colors outline-none focus-visible:ring-2">
        {"{{ }}"}
        <span className="font-sans">Insert variable</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          commandRef.current?.querySelector("input")?.focus();
        }}
      >
        <CommandPrimitive
          ref={commandRef}
          loop
          label="Variables"
          className="flex flex-col outline-none"
        >
          <CommandPrimitive.Input
            placeholder="Search variables…"
            className="border-line-strong placeholder:text-fg-tertiary h-10 border-b bg-transparent px-3 text-sm outline-none"
          />
          <CommandPrimitive.List className="scrollbar-none max-h-80 overflow-y-auto p-1">
            <CommandPrimitive.Empty className="caption-style text-fg-tertiary py-6 text-center">
              No matches
            </CommandPrimitive.Empty>
            {VARIABLE_GROUPS.map((group) => {
              const items = variables.filter((item) => item.group === group);
              if (!items.length) return null;
              return (
                <CommandPrimitive.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:text-fg-tertiary [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs"
                >
                  {items.map((item) => (
                    <CommandPrimitive.Item
                      key={item.key}
                      value={`${group} ${item.label} ${item.key}`}
                      onSelect={() => {
                        setOpen(false);
                        onPick(item.key);
                      }}
                      className="data-[selected=true]:bg-overlay-2 flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 outline-none"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.label}
                      </span>
                      <span className="text-fg-tertiary truncate font-mono text-xs">
                        {item.key}
                      </span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              );
            })}
          </CommandPrimitive.List>
          <p className="caption-style text-fg-tertiary border-line-strong border-t px-3 py-2 leading-snug">
            Add a fallback for empty values:{" "}
            <span className="text-fg-secondary font-mono">
              {"{{person.firstName|there}}"}
            </span>
            . Without one, a message with an empty variable is skipped.
          </p>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(event) => onChange(Math.trunc(Number(event.target.value)))}
      className={cn("tabular-nums", className)}
    />
  );
}

/** A labelled row with a control on the right, for switches. */
export function ToggleRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <span className="caption-style text-fg-tertiary leading-snug">
            {description}
          </span>
        )}
      </label>
      <div className="pt-0.5">{control(id)}</div>
    </div>
  );
}

export function IssueList({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-lg bg-(--tag-amber-bg) px-3 py-2.5 text-xs leading-snug text-(--tag-amber-text)">
      {issues.map((issue) => (
        <li key={issue} className="flex gap-2">
          <span aria-hidden>•</span>
          {issue}
        </li>
      ))}
    </ul>
  );
}
