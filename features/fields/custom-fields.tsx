"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "@/components/_ui/checkbox";
import InlineText from "@/components/fields/inline-text";
import OptionPicker from "@/components/fields/option-picker";
import { DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import { formatDay } from "@/features/deals/format";
import { useViewer } from "@/hooks/use-viewer";
import type {
  CustomFieldEntity,
  CustomValue,
} from "@/lib/domain/custom-fields";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { routes } from "@/lib/routes";

type Field = FunctionReturnType<typeof api.customFields.list>[number];
type Target =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { dealId: Id<"deals"> };
type Save = (field: Field, value: CustomValue | null) => Promise<string | void>;

/** Admin-defined fields of a record, editable inline. Hidden when the workspace defines none. */
export default function CustomFields({
  entity,
  target,
  values,
  className,
  divider,
}: {
  entity: CustomFieldEntity;
  target: Target;
  values: Record<string, CustomValue>;
  className?: string;
  divider?: boolean;
}) {
  const viewer = useViewer();
  const fields = useQuery(api.customFields.list, { entity });
  const setValue = useMutation(api.customFields.setValue);

  if (fields === undefined) return null;
  if (fields.length === 0) {
    if (viewer.role !== "admin") return null;
    return (
      <DetailSection
        title="Custom fields"
        className={className}
        divider={divider}
      >
        <Link
          href={routes.fields}
          className="text-fg-tertiary hover:text-foreground focus-visible:ring-ring -mt-2 w-fit rounded-sm text-sm underline underline-offset-2 outline-none focus-visible:ring-2"
        >
          Add a custom field
        </Link>
      </DetailSection>
    );
  }

  const save: Save = async (field, value) => {
    try {
      const previous = await setValue({ target, key: field.key, value });
      toast(
        `${field.label} updated`,
        () => void setValue({ target, key: field.key, value: previous }),
      );
    } catch (error) {
      return readError(error, "Couldn't save that change").message;
    }
  };

  return (
    <DetailSection
      collapsible
      title="Custom fields"
      className={className}
      divider={divider}
    >
      <Properties>
        {fields.map((field) => (
          <Property key={field.key} label={field.label}>
            <Editor field={field} value={values[field.key]} save={save} />
          </Property>
        ))}
      </Properties>
    </DetailSection>
  );
}

function Editor({
  field,
  value,
  save,
}: {
  field: Field;
  value: CustomValue | undefined;
  save: Save;
}) {
  const quiet = async (next: CustomValue | null) => {
    const message = await save(field, next);
    if (message) toast(message, { tone: "danger" });
  };

  switch (field.type) {
    case "checkbox":
      return (
        <Checkbox
          checked={value === true}
          aria-label={field.label}
          onCheckedChange={(checked) => void quiet(checked === true)}
        />
      );
    case "select":
      return (
        <OptionPicker
          value={typeof value === "string" ? value : null}
          label={field.label}
          options={field.options.map((option) => ({
            value: option,
            label: option,
          }))}
          clearLabel="Clear"
          onChange={(next) => void quiet(next)}
        />
      );
    case "date":
      return (
        <DateField
          label={field.label}
          value={typeof value === "string" ? value : null}
          onSave={(next) => void quiet(next)}
        />
      );
    case "number":
      return (
        <InlineText
          value={typeof value === "number" ? String(value) : null}
          label={field.label}
          onSave={(draft) => {
            const text = draft.trim();
            if (!text) return save(field, null);
            const number = Number(text);
            return Number.isFinite(number)
              ? save(field, number)
              : Promise.resolve("Enter a number");
          }}
        />
      );
    default:
      return (
        <InlineText
          value={typeof value === "string" ? value : null}
          label={field.label}
          onSave={(draft) => save(field, draft.trim() || null)}
        />
      );
  }
}

function DateField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function commit(partial: boolean) {
    setEditing(false);
    if (partial || draft === (value ?? "")) return;
    onSave(draft || null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget.validity.badInput);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.validity.badInput)}
        onKeyDown={onKeyDown}
        className="bg-background ring-ring -mx-1.5 h-7 min-w-0 rounded-lg px-1.5 text-sm leading-none tabular-nums ring-2 outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      aria-label={`Edit ${label}`}
      className="hover:bg-overlay-1 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 items-center rounded-md px-1.5 text-sm leading-none tabular-nums transition-colors outline-none focus-visible:ring-2"
    >
      {value ? (
        <span className="truncate">{formatDay(value)}</span>
      ) : (
        <span className="text-fg-tertiary">Empty</span>
      )}
    </button>
  );
}
