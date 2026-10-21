"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const TEXT = [
  "foreground",
  "fg-secondary",
  "fg-tertiary",
  "info",
  "success",
  "warning",
  "danger",
  "selected",
];
const SURFACES = ["background", "card", "muted"];

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  const [r, g, b] = [0, 2, 4].map((i) =>
    channel(parseInt(digits.slice(i, i + 2), 16)),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG contrast of each text role on each surface, measured from the live tokens. */
export default function ContrastTable() {
  const ref = useRef<HTMLTableElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ref.current) return;
    const style = getComputedStyle(ref.current);
    const next: Record<string, string> = {};
    for (const token of [...TEXT, ...SURFACES]) {
      next[token] = style.getPropertyValue(`--${token}`);
    }
    setValues(next);
  }, []);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table ref={ref} className="caption-style w-full min-w-96 tabular-nums">
        <caption className="sr-only">Contrast ratios</caption>
        <thead>
          <tr className="text-fg-tertiary text-left">
            <th scope="col" className="py-2 pr-3 font-normal">
              Text
            </th>
            {SURFACES.map((surface) => (
              <th
                key={surface}
                scope="col"
                className="py-2 pr-3 text-right font-normal"
              >
                on {surface}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {TEXT.map((token) => (
            <tr key={token}>
              <th
                scope="row"
                className="py-2 pr-3 text-left font-medium"
                style={{ color: `var(--${token})` }}
              >
                {token}
              </th>
              {SURFACES.map((surface) => {
                const value =
                  values[token] && values[surface]
                    ? ratio(values[token], values[surface])
                    : null;
                return (
                  <td key={surface} className="py-1.5 pr-3 text-right">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-14 items-center justify-end gap-1 rounded-md px-1.5",
                        value !== null && value < 4.5 && "text-danger",
                      )}
                      style={{
                        background: `var(--${surface})`,
                      }}
                    >
                      {value === null ? "–" : value.toFixed(1)}
                      <span className="text-fg-tertiary">
                        {value === null ? "" : value >= 4.5 ? "AA" : "fail"}
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
