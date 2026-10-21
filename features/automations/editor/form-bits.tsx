"use client";

import { useId, useRef, type ReactNode } from "react";
import { Input } from "@/components/_ui/input";
import {
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_LABEL,
} from "@/lib/domain/automations";
import { cn } from "@/lib/utils";

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
        <h3 className="text-fg-tertiary text-[11px] leading-4 font-medium tracking-wide uppercase">
          {title}
        </h3>
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

/** Text input or textarea with buttons that insert `{{variables}}` at the cursor. */
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
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
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
    "aria-invalid": invalid || undefined,
    onChange: (event: { target: { value: string } }) =>
      onChange(event.target.value),
  };
  return (
    <div className="flex flex-col gap-2">
      {multiline ? (
        <textarea
          {...common}
          rows={rows}
          className="border-input bg-secondary text-foreground placeholder:text-fg-tertiary focus-visible:border-selected focus-visible:ring-selected/20 hover:border-fg-tertiary aria-invalid:border-danger duration-fast w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed transition-[border-color,box-shadow] outline-none focus-visible:ring-3 disabled:opacity-60"
        />
      ) : (
        <Input {...common} className="aria-invalid:border-danger" />
      )}
      {!disabled && (
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label="Insert a variable"
          role="group"
        >
          {TEMPLATE_VARIABLES.map((name) => (
            <button
              key={name}
              type="button"
              title={TEMPLATE_VARIABLE_LABEL[name]}
              onClick={() => insert(name)}
              className="text-fg-tertiary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring duration-fast rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-4 transition-colors outline-none focus-visible:ring-2"
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
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
    <ul className="flex flex-col gap-1 rounded-lg border border-(--tag-amber-border) bg-(--tag-amber-bg) px-3 py-2.5 text-xs leading-snug text-(--tag-amber-text)">
      {issues.map((issue) => (
        <li key={issue} className="flex gap-2">
          <span aria-hidden>•</span>
          {issue}
        </li>
      ))}
    </ul>
  );
}
