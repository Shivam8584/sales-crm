"use client";

import {
  useId,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import Button from "@/components/_ui/button";
import { Card, CardHeader } from "@/components/_ui/card";
import EmptyState from "@/components/_ui/empty-state";
import IconBadge from "@/components/_ui/icon-badge";
import Skeleton from "@/components/_ui/skeleton";
import { PageStatus } from "@/components/shell/page";
import { useViewer } from "@/hooks/use-viewer";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import SettingsIcon from "@/public/assets/icons/settings.svg";

/** One-paragraph context under the page header of a settings page. */
export function SettingsIntro({ children }: { children: ReactNode }) {
  return <p className="text-fg-secondary max-w-prose">{children}</p>;
}

const CARD =
  "bg-card border-border shadow-card flex min-w-0 flex-col overflow-hidden rounded-xl border";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const BODY = "flex min-w-0 flex-col";

/** A settings card: eyebrow title and a short note, then its rows. */
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
    <Card aria-labelledby={id} className={className}>
      <CardHeader
        id={id}
        title={title}
        description={description}
        action={action}
        tone={tone}
      />
      <div className={BODY}>{children}</div>
    </Card>
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
        "border-border flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5",
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

/** A plain block inside a settings card, for content that isn't a label/control pair. */
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
        "border-border flex flex-col gap-3 border-t px-4 py-4 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className={cn(CARD, "gap-0")}>
      <div className="flex flex-col gap-2 px-4 py-4 sm:px-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-48 max-w-full" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(
            "border-border flex h-16 items-center gap-3 px-4 sm:px-5",
            index > 0 && "border-t",
          )}
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
  connected: { tone: "success", label: "Connected" },
  sandbox: { tone: "warning", label: "Sandbox" },
  partial: { tone: "warning", label: "Incomplete" },
  off: { tone: "neutral", label: "Not configured" },
} as const;

function HealthTag({ health }: { health: Health }) {
  const { tone, label } = HEALTH[health];
  return <PageStatus tone={tone}>{label}</PageStatus>;
}

/** Whether a secret or setting is present, as a status pill. */
export function ConfiguredTag({ on, label }: { on: boolean; label?: string }) {
  return (
    <PageStatus tone={on ? "success" : "neutral"}>
      {label ?? (on ? "Set" : "Not set")}
    </PageStatus>
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
    <Card className="py-6">
      <EmptyState
        icon={SettingsIcon}
        title="Only admins can change this"
        description="Ask an admin on your team if something here needs to change."
        action={
          <Button variant="secondary" size="sm" href="/settings/profile">
            Back to your profile
          </Button>
        }
      />
    </Card>
  );
}

/** Raised icon tile, the visual for integrations. */
export function IconTile({
  icon,
  className,
}: {
  icon: Icon;
  className?: string;
}) {
  return <IconBadge icon={icon} size="lg" className={className} />;
}

/** A card per integration: icon tile, name, what it does and its health or main action, then its details. */
export function IntegrationCard({
  visual,
  title,
  description,
  health,
  action,
  children,
}: {
  /** Usually an `IconTile`. */
  visual: ReactNode;
  title: string;
  description: ReactNode;
  health?: Health;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `integration-${useId()}`;
  return (
    <Card aria-labelledby={id}>
      <CardHeader
        id={id}
        visual={visual}
        title={title}
        meta={health && <HealthTag health={health} />}
        description={description}
        action={action}
      />
      <div className={BODY}>{children}</div>
    </Card>
  );
}
