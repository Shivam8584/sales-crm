import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "hero", "body", "title", "2xs"],
      spacing: [
        "control-xs",
        "control-sm",
        "control-md",
        "control-lg",
        "touch",
        "row",
      ],
    },
    classGroups: {
      z: [{ z: ["sticky", "sticky-header", "floating", "overlay", "toast"] }],
      duration: [{ duration: ["fast", "base", "slow", "panel"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
