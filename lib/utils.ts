import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ["display"] },
    classGroups: {
      "font-size": [{ text: ["display"] }],
      z: [{ z: ["sticky", "sticky-header", "floating", "overlay", "toast"] }],
      duration: [{ duration: ["fast", "base", "slow", "panel"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
