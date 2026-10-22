"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import {
  SettingsBlock,
  SettingsSection,
} from "@/features/settings/settings-ui";
import { LIMITS, checkSender } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import type { AutomationDoc } from "./editor/editor-context";

const UNTRACKED =
  "Replies to this address aren't read by the CRM, so “unsubscribe” replies won't be processed.";

/** Who the sequence's emails come from and where replies go. Saves on its own, without republishing. */
export function SendingFields({ automation }: { automation: AutomationDoc }) {
  const id = automation._id;
  const setSender = useMutation(api.automations.setSender);
  const saved = automation.settings;
  const [senderName, setSenderName] = useState(saved.senderName ?? "");
  const [replyTo, setReplyTo] = useState(saved.replyTo ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<{
    field?: string;
    message: string;
  } | null>(null);

  const check = checkSender({ senderName, replyTo });
  const error = !check.ok ? check : serverError;
  const dirty =
    senderName.trim() !== (saved.senderName ?? "") ||
    replyTo.trim().toLowerCase() !== (saved.replyTo ?? "");
  const hasSender = Boolean(saved.senderName || saved.replyTo);

  async function apply(next: { senderName: string; replyTo: string }) {
    setSaving(true);
    setServerError(null);
    try {
      const { previous } = await setSender({
        id,
        senderName: next.senderName.trim() || undefined,
        replyTo: next.replyTo.trim() || undefined,
      });
      toast(
        "Sending details saved",
        () =>
          void setSender({ id, ...previous }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          ),
      );
    } catch (reason) {
      setServerError(readError(reason));
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (check.ok && dirty) void apply({ senderName, replyTo });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field
        label="Sender name"
        htmlFor={`sender-name-${id}`}
        hint="Shown as the From name."
        error={error?.field === "senderName" ? error.message : undefined}
      >
        <Input
          id={`sender-name-${id}`}
          value={senderName}
          maxLength={LIMITS.senderName}
          placeholder="Workspace default"
          autoComplete="off"
          onChange={(event) => setSenderName(event.target.value)}
        />
      </Field>
      <Field
        label="Reply-to address"
        htmlFor={`reply-to-${id}`}
        hint="Replies go here instead of the workspace address."
        error={error?.field === "replyTo" ? error.message : undefined}
      >
        <Input
          id={`reply-to-${id}`}
          type="email"
          value={replyTo}
          placeholder="Workspace default"
          autoComplete="off"
          onChange={(event) => setReplyTo(event.target.value)}
        />
      </Field>
      {!automation.replyTracked && (
        <p role="status" className="caption-style text-warning leading-snug">
          {UNTRACKED}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!dirty || !check.ok}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving || !hasSender}
          onClick={() => {
            setSenderName("");
            setReplyTo("");
            void apply({ senderName: "", replyTo: "" });
          }}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}

/** The same fields as a settings card, for reps, who have no side panel. */
export function SendingSection({ automation }: { automation: AutomationDoc }) {
  return (
    <SettingsSection
      title="Sending"
      description="How this sequence's emails appear to recipients."
    >
      <SettingsBlock>
        <SendingFields
          key={`${automation.settings.senderName}|${automation.settings.replyTo}`}
          automation={automation}
        />
      </SettingsBlock>
    </SettingsSection>
  );
}
