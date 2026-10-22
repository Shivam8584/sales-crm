"use client";

import { useId, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { useViewer } from "@/hooks/use-viewer";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { routes } from "@/lib/routes";

/** One-paragraph context under the page header of a settings page. */
export function SettingsIntro({ children }: { children: ReactNode }) {
  return <p className="text-body text-fg-secondary max-w-prose">{children}</p>;
}

/** A titled group of rows, separated from its neighbours by whitespace. */
export function SettingsSection({
  title,
  description,
  tone = "default",
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  tone?: "default" | "danger";
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = `settings-${useId()}`;
  return (
    <section
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col", className)}
    >
      <SectionHeader
        id={id}
        title={title}
        description={description}
        action={action}
        tone={tone}
      />
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}

function SectionHeader({
  id,
  title,
  meta,
  description,
  action,
  tone = "default",
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <header className="flex min-w-0 items-start gap-3 pb-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2
            id={id}
            className={cn("title-style", tone === "danger" && "text-danger")}
          >
            {title}
          </h2>
          {meta}
        </div>
        {description && (
          <p className="text-fg-secondary max-w-prose text-sm text-pretty">
            {description}
          </p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </header>
  );
}

/** Label and note on the left, the control on the right; stacks on phones. */
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
        "border-border flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label htmlFor={htmlFor} className="text-body font-medium">
          {label}
        </Label>
        {description && (
          <span className="text-fg-secondary text-sm text-pretty">
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

/** A plain block inside a section, for content that isn't a label/control pair. */
export function SettingsBlock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-col gap-3 border-t py-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRowSkeleton() {
  return (
    <div
      aria-hidden
      className="border-border flex h-13 items-center gap-3 border-t"
    >
      <Skeleton className="h-3 w-40" />
      <Skeleton className="ml-auto h-3 w-16" />
    </div>
  );
}

export function SettingsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="flex flex-col gap-2 pb-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-48 max-w-full" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="border-border flex h-14 items-center gap-3 border-t"
        >
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-56 max-w-full" />
          </span>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export type Health = "connected" | "sandbox" | "partial" | "off";

const HEALTH = {
  connected: { className: "text-fg-secondary", label: "Connected" },
  sandbox: { className: "text-warning", label: "Sandbox" },
  partial: { className: "text-warning", label: "Incomplete" },
  off: { className: "text-fg-tertiary", label: "Not configured" },
} as const;

function HealthTag({ health }: { health: Health }) {
  const { className, label } = HEALTH[health];
  return <span className={cn("caption-style", className)}>{label}</span>;
}

const STATUS_TONE = {
  neutral: "text-fg-secondary",
  muted: "text-fg-tertiary",
  warning: "text-warning",
  danger: "text-danger",
} as const;

/** Status as coloured text; colour only for states that need attention. */
export function StatusText({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof STATUS_TONE;
  children: ReactNode;
}) {
  return (
    <span className={cn("lead-style", STATUS_TONE[tone])}>{children}</span>
  );
}

/** Whether a secret or setting is present. */
export function ConfiguredTag({ on, label }: { on: boolean; label?: string }) {
  return (
    <StatusText tone={on ? "neutral" : "muted"}>
      {label ?? (on ? "Set" : "Not set")}
    </StatusText>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="text-fg-secondary font-mono text-[0.95em]">
      {children}
    </code>
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
      "border-input bg-secondary text-fg-secondary focus-visible:border-selected focus-visible:ring-selected/20 duration-fast w-full min-w-0 rounded-lg border px-3 font-mono text-xs transition-[border-color,box-shadow] outline-none focus-visible:ring-3",
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
        variant="secondary"
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
    <div className="flex flex-col items-start gap-3 py-6">
      <p className="text-fg-tertiary">
        Only admins can change this. Ask an admin on your team.
      </p>
      <Button variant="secondary" size="sm" href={routes.profile}>
        Back to your profile
      </Button>
    </div>
  );
}

/** A section per integration: name and health, what it does, then its details. */
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
  const id = `integration-${useId()}`;
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col">
      <SectionHeader
        id={id}
        title={title}
        meta={health && <HealthTag health={health} />}
        description={description}
        action={action}
      />
      <div className="flex min-w-0 flex-col">{children}</div>
    </section>
  );
}
