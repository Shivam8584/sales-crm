"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { create } from "zustand";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/_ui/input";
import OptionPicker from "@/components/fields/option-picker";
import {
  SUBJECT_LABEL,
  canonicalVariable,
  missingMessage,
  nodeTexts,
  templateTokens,
  type GraphNode,
} from "@/lib/domain/automations";
import { useEditor } from "./editor-context";
import { PanelSection } from "./form-bits";

type PreviewState = {
  /** Per automation, so switching automations doesn't keep a record of the wrong kind. */
  targets: Record<string, { id: string; name: string } | undefined>;
  context: Record<string, string>;
  setTarget: (
    automationId: string,
    target: { id: string; name: string },
  ) => void;
  setContext: (key: string, value: string) => void;
};

const usePreviewStore = create<PreviewState>((set) => ({
  targets: {},
  context: {},
  setTarget: (automationId, target) =>
    set((state) => ({ targets: { ...state.targets, [automationId]: target } })),
  setContext: (key, value) =>
    set((state) => ({ context: { ...state.context, [key]: value } })),
}));

const DEBOUNCE_MS = 300;

function useDebounced<T>(value: T) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

const BLOCKS: Partial<Record<GraphNode["kind"], string[]>> = {
  send_email: ["Subject", "Message"],
  create_task: ["Task", "Notes"],
  notify: ["Message"],
};

/** The step's text filled in for a chosen record, with warnings for empty variables. */
export default function TemplatePreview({ node }: { node: GraphNode }) {
  const { automation } = useEditor();
  const id = useId();
  const kind = automation.subjectKind;
  const target = usePreviewStore((state) => state.targets[automation._id]);
  const context = usePreviewStore((state) => state.context);
  const setTarget = usePreviewStore((state) => state.setTarget);
  const setContext = usePreviewStore((state) => state.setContext);
  const records = useQuery(api.automations.subjects, { kind });
  const textsKey = useDebounced(JSON.stringify(nodeTexts(node)));
  const texts = useMemo(() => JSON.parse(textsKey) as string[], [textsKey]);
  const prospectKeys = useMemo(
    () => [
      ...new Set(
        texts
          .flatMap(templateTokens)
          .map((token) => canonicalVariable(token.name))
          .filter((name) => name.startsWith("prospect.")),
      ),
    ],
    [texts],
  );
  const preview = useQuery(
    api.automations.preview,
    target
      ? {
          target: { kind, id: target.id },
          texts,
          context: Object.fromEntries(
            prospectKeys.map((key) => [key, context[key] ?? ""]),
          ),
          channel: node.kind === "send_whatsapp" ? "whatsapp" : "email",
        }
      : "skip",
  );

  const options = (records ?? []).map((record) => ({
    value: record.id,
    label: record.name,
    hint: record.meta ?? undefined,
  }));
  if (target && !options.some((option) => option.value === target.id)) {
    options.unshift({ value: target.id, label: target.name, hint: undefined });
  }

  const outbound = node.kind === "send_email" || node.kind === "send_whatsapp";
  const missing = [
    ...new Set(preview?.results.flatMap((result) => result.missing) ?? []),
  ];
  const labels =
    BLOCKS[node.kind] ?? texts.map((_, index) => `Parameter {{${index + 1}}}`);

  return (
    <PanelSection title="Preview">
      <div className="flex flex-col gap-3">
        <OptionPicker
          value={target?.id ?? null}
          label={`Preview with a ${SUBJECT_LABEL[kind][0]}`}
          placeholder={`Pick a ${SUBJECT_LABEL[kind][0]}`}
          searchPlaceholder={`Search ${SUBJECT_LABEL[kind][1]}…`}
          options={options}
          onChange={(value) => {
            const option = options.find((item) => item.value === value);
            if (option) {
              setTarget(automation._id, {
                id: option.value,
                name: option.label,
              });
            }
          }}
          className="border-input bg-secondary hover:border-fg-tertiary mx-0 h-9 w-full rounded-lg border px-3"
        />
        {prospectKeys.map((key) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="caption-style text-fg-secondary">
              {`{{${key}}}`}{" "}
              <span className="text-fg-tertiary">
                (given when the record is enrolled)
              </span>
            </span>
            <Input
              id={`${id}-${key}`}
              value={context[key] ?? ""}
              placeholder="Sample value"
              onChange={(event) => setContext(key, event.target.value)}
            />
          </label>
        ))}
        {target && preview === undefined && (
          <div className="bg-overlay-1 h-24 animate-pulse rounded-lg" />
        )}
        {target && preview === null && (
          <p className="caption-style text-fg-tertiary">
            That record no longer exists.
          </p>
        )}
        {preview && (
          <div className="bg-overlay-1 flex flex-col gap-3 rounded-lg px-3.5 py-3">
            {outbound && (
              <p className="caption-style text-fg-tertiary truncate">
                To{" "}
                <span className="text-fg-secondary">
                  {preview.recipient
                    ? `${preview.recipient.name}${preview.recipient.address ? ` · ${preview.recipient.address}` : " · no address on record"}`
                    : "nobody on the record"}
                </span>
              </p>
            )}
            {preview.results.map((result, index) => (
              <div key={index} className="flex min-w-0 flex-col gap-0.5">
                <span className="caption-style text-fg-tertiary">
                  {labels[index]}
                </span>
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {result.text.trim() || (
                    <span className="text-fg-tertiary">Empty</span>
                  )}
                </p>
              </div>
            ))}
            {missing.length > 0 && (
              <p className="rounded-lg bg-(--tag-amber-bg) px-3 py-2 text-xs leading-snug text-(--tag-amber-text)">
                {outbound
                  ? `Would be skipped for ${preview.record}: ${missingMessage(missing)}`
                  : `${missing.map((name) => `{{${name}}}`).join(", ")} would be left blank for ${preview.record}.`}
              </p>
            )}
          </div>
        )}
      </div>
    </PanelSection>
  );
}
