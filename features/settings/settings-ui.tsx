"use client";

import { useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Tag, { type TagTone } from "@/components/_ui/tag";
import { useViewer } from "@/hooks/use-viewer";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import SettingsIcon from "@/public/assets/icons/settings.svg";

/** Title block at the top of a settings page. */
export function SettingsTitle({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pb-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2 className="flex items-center gap-2">
          {title}
          {meta && (
            <span className="caption-style text-fg-tertiary font-normal tabular-nums">
              {meta}
            </span>
          )}
        </h2>
        {description && (
          <p className="text-fg-secondary max-w-prose">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** A titled group of rows on a card. */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3 pb-8", className)}>
      <div className="flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3>{title}</h3>
          {description && (
            <p className="caption-style text-fg-tertiary leading-snug">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      <div className="bg-card border-border shadow-card divide-border flex flex-col divide-y rounded-xl border">
        {children}
      </div>
    </section>
  );
}

/** Label and description on the left, the control on the right; stacks on phones. */
export function SettingsRow({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label htmlFor={htmlFor} className="lead-style font-medium">
          {label}
        </Label>
        {description && (
          <span className="caption-style text-fg-tertiary leading-snug">
            {description}
          </span>
        )}
      </div>
      {children && (
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

export type Health = "connected" | "sandbox" | "partial" | "off";

const HEALTH: Record<Health, { tone: TagTone; label: string }> = {
  connected: { tone: "green", label: "Connected" },
  sandbox: { tone: "amber", label: "Sandbox" },
  partial: { tone: "amber", label: "Incomplete" },
  off: { tone: "neutral", label: "Not configured" },
};

export function HealthTag({ health }: { health: Health }) {
  const { tone, label } = HEALTH[health];
  return (
    <Tag tone={tone} size="sm" className="gap-1.5">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </Tag>
  );
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A read-only value with a copy button, for URLs and snippets. */
export function CopyField({
  id,
  label,
  value,
  multiline = false,
}: {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await writeClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast("Couldn't copy. Select the text and copy it yourself.", {
        tone: "warning",
      });
      document.getElementById(id)?.focus();
    }
  }

  const shared = {
    id,
    readOnly: true,
    value,
    "aria-label": label,
    spellCheck: false,
    onFocus: (event: {
      currentTarget: HTMLInputElement | HTMLTextAreaElement;
    }) => event.currentTarget.select(),
    className:
      "border-input bg-secondary text-fg-secondary focus-visible:border-selected focus-visible:ring-selected/20 w-full min-w-0 rounded-lg border px-3 font-mono text-xs transition-[border-color,box-shadow] outline-none focus-visible:ring-3",
  };

  return (
    <div className={cn("flex gap-2", multiline ? "flex-col" : "items-center")}>
      {multiline ? (
        <textarea
          {...shared}
          rows={value.split("\n").length}
          className={cn(
            shared.className,
            "[field-sizing:content] max-h-80 resize-none py-2.5 leading-relaxed",
          )}
        />
      ) : (
        <input {...shared} className={cn(shared.className, "h-9")} />
      )}
      <Button
        variant="subtle"
        size="control"
        className={cn("w-18 px-3", multiline && "self-end")}
        onClick={() => void copy()}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}

/** Renders children for admins; everyone else sees why the page is closed. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const viewer = useViewer();
  if (viewer.role === "admin") return <>{children}</>;
  return (
    <EmptyState
      icon={SettingsIcon}
      title="Only admins can change this"
      description="Ask an admin on your team if something here needs to change."
      action={
        <Button variant="secondary" size="sm" href="/settings/profile">
          Back to your profile
        </Button>
      }
      className="py-20"
    />
  );
}

/** A card per integration: name, what it does and its health or main action, then its details. */
export function IntegrationCard({
  title,
  description,
  health,
  action,
  children,
}: {
  title: string;
  description: ReactNode;
  health?: Health;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card border-border shadow-card divide-border flex flex-col divide-y rounded-xl border">
      <header className="flex items-start gap-4 px-4 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3>{title}</h3>
          <p className="caption-style text-fg-tertiary leading-snug">
            {description}
          </p>
        </div>
        {health && <HealthTag health={health} />}
        {action}
      </header>
      {children}
    </section>
  );
}
