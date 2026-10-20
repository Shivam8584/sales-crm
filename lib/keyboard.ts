export function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export const MOD_KEY =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
    ? "⌘"
    : "Ctrl";
