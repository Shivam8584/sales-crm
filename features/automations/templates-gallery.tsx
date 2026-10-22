"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

type Template = FunctionReturnType<
  typeof api.automations.catalog
>["templates"][number];

const count = (steps: Template["steps"], kind: Template["steps"][number]) =>
  steps.filter((item) => item === kind).length;

function summary(steps: Template["steps"]) {
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

  async function use(template: Template) {
    setCreating(template.key);
    try {
      const id = await createFromTemplate({ key: template.key });
      router.push(`/automations/${id}`);
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
        : templates.map((template) => (
            <li
              key={template.key}
              className="bg-card shadow-card flex flex-col gap-4 rounded-2xl p-5"
            >
              <h3 className="text-base leading-6 font-medium text-balance">
                {template.name}
              </h3>
              <p className="text-fg-secondary line-clamp-3 text-sm leading-5">
                {template.description}
              </p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                <span className="caption-style text-fg-tertiary">
                  {summary(template.steps)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={Boolean(creating)}
                  loading={creating === template.key}
                  onClick={() => void use(template)}
                >
                  Use template
                </Button>
              </div>
            </li>
          ))}
    </ul>
  );
}
