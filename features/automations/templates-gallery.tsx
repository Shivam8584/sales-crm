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
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
      {templates === undefined
        ? Array.from({ length: 3 }, (_, index) => (
            <li
              key={index}
              className="bg-card shadow-card flex h-56 flex-col gap-4 rounded-2xl p-5"
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-7 w-40" />
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
                className="bg-card shadow-card flex flex-col gap-4 rounded-2xl p-5"
              >
                <h3 className="text-base leading-6 font-medium text-balance">
                  {template.name}
                </h3>
                <p
                  lang={copy.language === "hi" ? "hi" : undefined}
                  className="text-fg-secondary line-clamp-3 text-sm leading-5"
                >
                  {copy.description}
                </p>
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
                    className="self-start"
                  />
                )}
                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                  <span className="caption-style text-fg-tertiary">
                    {summary(copy.steps)}
                  </span>
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
