"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import SegmentedControl from "@/components/_ui/segmented-control";
import Skeleton from "@/components/_ui/skeleton";
import { LANGUAGE_LABEL, type Language } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { routes } from "@/lib/routes";

type Template = FunctionReturnType<
  typeof api.automations.catalog
>["templates"][number];

type Steps = Template["copies"][number]["steps"];

const count = (steps: Steps, kind: Steps[number]) =>
  steps.filter((item) => item === kind).length;

function summary(steps: Steps) {
  const emails = count(steps, "send_email");
  const tasks = count(steps, "create_task");
  return [
    `${steps.length - 1} steps`,
    `${emails} ${emails === 1 ? "email" : "emails"}`,
    `${tasks} ${tasks === 1 ? "task" : "tasks"}`,
  ].join(" · ");
}

/** Ready-made sequences; using one creates a draft copy. */
export default function TemplatesGallery({
  templates,
}: {
  templates: Template[] | undefined;
}) {
  const router = useRouter();
  const createFromTemplate = useMutation(api.automations.createFromTemplate);
  const [creating, setCreating] = useState<string | null>(null);
  const [languages, setLanguages] = useState<Record<string, Language>>({});

  async function use(template: Template, language: Language) {
    setCreating(template.key);
    try {
      const id = await createFromTemplate({ key: template.key, language });
      router.push(routes.sequence(id));
      toast(`Created “${template.name}” as a draft`);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
      setCreating(null);
    }
  }

  return (
    <ul className="flex flex-col">
      {templates === undefined
        ? Array.from({ length: 3 }, (_, index) => (
            <li
              key={index}
              className="border-border flex flex-col gap-2 border-t py-4"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full max-w-md" />
            </li>
          ))
        : templates.map((template) => {
            const copy =
              template.copies.find(
                (item) => item.language === languages[template.key],
              ) ?? template.copies[0];
            return (
              <li
                key={template.key}
                className="border-border flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="text-sm font-medium text-balance">
                    {template.name}
                  </h3>
                  <p
                    lang={copy.language === "hi" ? "hi" : undefined}
                    className="text-fg-secondary line-clamp-2 text-sm"
                  >
                    {copy.description}
                  </p>
                  <span className="caption-style text-fg-tertiary">
                    {summary(copy.steps)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {template.copies.length > 1 && (
                    <SegmentedControl
                      label={`${template.name} language`}
                      value={copy.language}
                      onChange={(language) =>
                        setLanguages((current) => ({
                          ...current,
                          [template.key]: language as Language,
                        }))
                      }
                      segments={template.copies.map((item) => ({
                        value: item.language,
                        label: LANGUAGE_LABEL[item.language],
                      }))}
                    />
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={Boolean(creating)}
                    loading={creating === template.key}
                    onClick={() => void use(template, copy.language)}
                  >
                    Use template
                  </Button>
                </div>
              </li>
            );
          })}
    </ul>
  );
}
