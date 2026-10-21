"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { SUBJECT_LABEL } from "@/lib/domain/automations";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { StepIcons } from "./automation-parts";

type Template = FunctionReturnType<
  typeof api.automations.catalog
>["templates"][number];

/** Ready-made automations; using one creates an editable draft. */
export default function TemplatesGallery({
  templates,
  canCreate,
}: {
  templates: Template[] | undefined;
  canCreate: boolean;
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
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base leading-6 font-medium text-balance">
                  {template.name}
                </h3>
                <p className="caption-style text-fg-tertiary leading-snug">
                  Runs on {SUBJECT_LABEL[template.subjectKind][1]} ·{" "}
                  {template.trigger}
                </p>
              </div>
              <p className="text-fg-secondary line-clamp-3 text-sm leading-5">
                {template.description}
              </p>
              <StepIcons steps={template.steps} max={8} size="sm" />
              <div className="mt-auto flex justify-end pt-1">
                <Button
                  variant={canCreate ? "secondary" : "ghost"}
                  size="sm"
                  disabled={!canCreate || Boolean(creating)}
                  loading={creating === template.key}
                  onClick={() => void use(template)}
                  title={
                    canCreate
                      ? undefined
                      : "Managers and admins create automations"
                  }
                >
                  Use template
                </Button>
              </div>
            </li>
          ))}
    </ul>
  );
}
