"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import SelectField from "@/components/_ui/select-field";
import { Textarea } from "@/components/_ui/textarea";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABEL,
  MAX_CUSTOM_FIELDS,
  MAX_FIELD_OPTIONS,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/lib/domain/custom-fields";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import {
  AdminOnly,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "./settings-ui";

type CustomField = FunctionReturnType<typeof api.customFields.list>[number];

const ENTITY_TITLE: Record<CustomFieldEntity, string> = {
  account: "Accounts",
  person: "People",
  deal: "Deals",
};

export default function FieldsSettings() {
  return (
    <AdminOnly>
      {CUSTOM_FIELD_ENTITIES.map((entity) => (
        <EntityFields key={entity} entity={entity} />
      ))}
    </AdminOnly>
  );
}

function EntityFields({ entity }: { entity: CustomFieldEntity }) {
  const fields = useQuery(api.customFields.list, { entity });
  const reorder = useMutation(api.customFields.reorder);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CustomField | null>(null);

  if (fields === undefined) return <SettingsSkeleton rows={2} />;

  async function move(index: number, by: -1 | 1) {
    const ids = fields!.map((field) => field._id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    try {
      await reorder({ entity, ids });
    } catch (error) {
      toast(readError(error, "Couldn't reorder the fields").message, {
        tone: "danger",
      });
    }
  }

  return (
    <SettingsSection
      title={ENTITY_TITLE[entity]}
      description={`${fields.length} of ${MAX_CUSTOM_FIELDS} fields`}
      action={
        <Button
          variant="secondary"
          size="xs"
          disabled={fields.length >= MAX_CUSTOM_FIELDS}
          onClick={() => setAdding(true)}
        >
          <PlusIcon aria-hidden className="size-2.5" />
          Add field
        </Button>
      }
    >
      {fields.length === 0 ? (
        <SettingsRow
          label="No custom fields yet"
          description={`A field you add shows on every ${entity}.`}
        >
          <Button variant="secondary" size="xs" onClick={() => setAdding(true)}>
            Add the first field
          </Button>
        </SettingsRow>
      ) : (
        fields.map((field, index) => (
          <SettingsRow
            key={field._id}
            label={field.label}
            className="group"
            description={[
              CUSTOM_FIELD_TYPE_LABEL[field.type],
              ...(field.type === "select" ? [field.options.join(" · ")] : []),
            ].join(" · ")}
          >
            <span className="flex items-center transition-opacity not-pointer-coarse:opacity-0 not-pointer-coarse:group-focus-within:opacity-100 not-pointer-coarse:group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${field.label} up`}
                disabled={index === 0}
                onClick={() => void move(index, -1)}
              >
                <ChevronDownIcon aria-hidden className="size-3.5 rotate-180" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${field.label} down`}
                disabled={index === fields.length - 1}
                onClick={() => void move(index, 1)}
              >
                <ChevronDownIcon aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${field.label}`}
                onClick={() => setRemoving(field)}
              >
                <TrashIcon aria-hidden className="size-3.5" />
              </Button>
            </span>
          </SettingsRow>
        ))
      )}
      <AddFieldDialog entity={entity} open={adding} onOpenChange={setAdding} />
      <RemoveFieldDialog field={removing} onClose={() => setRemoving(null)} />
    </SettingsSection>
  );
}

function AddFieldDialog({
  entity,
  open,
  onOpenChange,
}: {
  entity: CustomFieldEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.customFields.create);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);

  function reset() {
    setLabel("");
    setType("text");
    setOptions("");
    setErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      setErrors({ label: "Enter a name for the field" });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      await create({
        entity,
        label,
        type,
        options: type === "select" ? options.split("\n") : undefined,
      });
      onOpenChange(false);
      toast(`${label.trim()} added`);
    } catch (error) {
      const { message, field } = readError(error, "Couldn't add the field");
      setErrors({
        [field === "label" || field === "options" ? field : "form"]: message,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-110" onCloseAutoFocus={reset}>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a {entity} field</DialogTitle>
            <DialogDescription>
              The type can&apos;t change later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4 px-6 py-5">
            <Field
              label="Name"
              htmlFor="field-label"
              required
              error={errors.label}
            >
              <Input
                id="field-label"
                autoFocus
                autoComplete="off"
                maxLength={60}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Contract renewal"
                aria-invalid={errors.label ? true : undefined}
              />
            </Field>
            <Field label="Type" htmlFor="field-type">
              <SelectField
                id="field-type"
                value={type}
                onChange={setType}
                options={CUSTOM_FIELD_TYPES.map((value) => ({
                  value,
                  label: CUSTOM_FIELD_TYPE_LABEL[value],
                }))}
              />
            </Field>
            {type === "select" && (
              <Field
                label="Options"
                htmlFor="field-options"
                hint={`One per line, up to ${MAX_FIELD_OPTIONS}.`}
                error={errors.options}
              >
                <Textarea
                  id="field-options"
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                  placeholder={"Gold\nSilver\nBronze"}
                  aria-invalid={errors.options ? true : undefined}
                />
              </Field>
            )}
            {errors.form && (
              <p role="alert" className="caption-style text-danger">
                {errors.form}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Add field
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveFieldDialog({
  field,
  onClose,
}: {
  field: CustomField | null;
  onClose: () => void;
}) {
  const remove = useMutation(api.customFields.remove);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!field) return;
    setSaving(true);
    try {
      await remove({ id: field._id });
      toast(`${field.label} deleted`);
      onClose();
    } catch (error) {
      toast(readError(error, "Couldn't delete the field").message, {
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={field !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-110">
        <DialogHeader>
          <DialogTitle>Delete {field?.label}?</DialogTitle>
          <DialogDescription>
            It disappears from every record. Saved values come back if you add a
            field with the same name and type.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => void confirm()}
          >
            Delete field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
