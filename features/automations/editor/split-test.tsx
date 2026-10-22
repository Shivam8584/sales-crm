"use client";

import Field from "@/components/_ui/field";
import { Switch } from "@/components/_ui/switch";
import type { AbConfig } from "@/lib/domain/ab-test";
import type { EmailConfig } from "@/lib/domain/automations";
import { NumberInput, TemplateInput, ToggleRow } from "./form-bits";

/** A second subject and/or message for an email step, shown to part of the audience. */
export default function SplitTest({
  id,
  config,
  fieldErrors,
  readOnly,
  set,
}: {
  id: string;
  config: EmailConfig;
  fieldErrors: Record<string, string>;
  readOnly: boolean;
  set: (patch: { ab: AbConfig | undefined }) => void;
}) {
  const { ab } = config;
  return (
    <>
      <ToggleRow
        label="Test a second version"
        description="Send a different subject or message to part of the audience. Each person always gets the same version."
        control={(controlId) => (
          <Switch
            id={controlId}
            checked={Boolean(ab)}
            disabled={readOnly}
            onCheckedChange={(on) =>
              set({ ab: on ? { splitB: 50 } : undefined })
            }
          />
        )}
      />
      {ab && (
        <>
          <Field
            label="Version B subject"
            htmlFor={`${id}-ab-subject`}
            error={fieldErrors.abSubject}
            hint="Leave empty to keep the subject above."
          >
            <TemplateInput
              id={`${id}-ab-subject`}
              value={ab.subject ?? ""}
              disabled={readOnly}
              invalid={Boolean(fieldErrors.abSubject)}
              onChange={(subject) => set({ ab: { ...ab, subject } })}
            />
          </Field>
          <Field
            label="Version B message"
            htmlFor={`${id}-ab-body`}
            error={fieldErrors.abBody}
            hint="Leave empty to keep the message above."
          >
            <TemplateInput
              id={`${id}-ab-body`}
              multiline
              rows={6}
              value={ab.body ?? ""}
              disabled={readOnly}
              invalid={Boolean(fieldErrors.abBody)}
              onChange={(body) => set({ ab: { ...ab, body } })}
            />
          </Field>
          <Field
            label="Share that gets version B (%)"
            htmlFor={`${id}-ab-split`}
            error={fieldErrors.abSplit}
          >
            <NumberInput
              id={`${id}-ab-split`}
              value={ab.splitB}
              min={0}
              max={100}
              disabled={readOnly}
              onChange={(splitB) => set({ ab: { ...ab, splitB } })}
            />
          </Field>
        </>
      )}
    </>
  );
}
