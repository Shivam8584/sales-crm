import { cn } from "@/lib/utils";

const TONES = [
  "bg-(--tag-blue-bg) text-(--tag-blue-text)",
  "bg-(--tag-purple-bg) text-(--tag-purple-text)",
  "bg-(--tag-green-bg) text-(--tag-green-text)",
  "bg-(--tag-teal-bg) text-(--tag-teal-text)",
  "bg-(--tag-orange-bg) text-(--tag-orange-text)",
  "bg-(--tag-amber-bg) text-(--tag-amber-text)",
  "bg-(--tag-red-bg) text-(--tag-red-text)",
  "bg-(--tag-moss-bg) text-(--tag-moss-text)",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    parts[0][0] + (parts.length > 1 ? parts.at(-1)![0] : "")
  ).toUpperCase();
}

function tone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

const SIZES = {
  xs: "size-4 text-[7.5px]",
  sm: "size-5 text-[9px]",
  md: "size-7 text-[11px]",
  lg: "size-10 text-sm",
  xl: "size-12 text-base",
};

type AvatarProps = {
  name: string;
  size?: keyof typeof SIZES;
  /** Announced name; omit when the name is already visible next to it. */
  label?: string;
  className?: string;
};

/** Initials on a colour derived from the name, so a person keeps one colour everywhere. */
export default function Avatar({
  name,
  size = "sm",
  label,
  className,
}: AvatarProps) {
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
  return (
    <span
      {...a11y}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full leading-none font-semibold tracking-tight select-none",
        SIZES[size],
        tone(name),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
