import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type TagTone =
  | "blue"
  | "purple"
  | "green"
  | "moss"
  | "red"
  | "orange"
  | "amber"
  | "teal"
  | "yellow"
  | "neutral";

export const tagVariants = cva(
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full text-xs leading-none font-medium tabular-nums",
  {
    variants: {
      tone: {
        blue: "bg-(--tag-blue-bg) text-(--tag-blue-text)",
        purple: "bg-(--tag-purple-bg) text-(--tag-purple-text)",
        green: "bg-(--tag-green-bg) text-(--tag-green-text)",
        moss: "bg-(--tag-moss-bg) text-(--tag-moss-text)",
        red: "bg-(--tag-red-bg) text-(--tag-red-text)",
        orange: "bg-(--tag-orange-bg) text-(--tag-orange-text)",
        amber: "bg-(--tag-amber-bg) text-(--tag-amber-text)",
        teal: "bg-(--tag-teal-bg) text-(--tag-teal-text)",
        yellow: "bg-(--tag-yellow-bg) text-(--tag-yellow-text)",
        neutral: "bg-(--tag-neutral-bg) text-(--tag-neutral-text)",
      },
      size: {
        md: "h-6 px-2.5",
        sm: "h-5.5 px-2",
        xs: "h-5 gap-1 px-1.5",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  },
);

type TagProps = ComponentProps<"span"> & VariantProps<typeof tagVariants>;

export default function Tag({ tone, size, className, ...props }: TagProps) {
  return (
    <span className={cn(tagVariants({ tone, size }), className)} {...props} />
  );
}
