export const CUSTOM_FIELD_ENTITIES = ["account", "person", "deal"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "checkbox",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  checkbox: "Checkbox",
};

export const MAX_CUSTOM_FIELDS = 20;
export const MAX_FIELD_OPTIONS = 20;
export const MAX_OPTION_LENGTH = 40;
export const MAX_LABEL_LENGTH = 60;
export const MAX_TEXT_LENGTH = 500;

export type CustomValue = string | number | boolean;

export function fieldKey(label: string) {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
