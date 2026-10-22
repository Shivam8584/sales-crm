"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import Button, { buttonVariants } from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/_ui/select";
import { EMBED_HEIGHT_MESSAGE } from "@/features/demo/embed-resizer";
import { LEAD_LIMITS, type Utm } from "@/lib/domain/leads";
import { CopyField, IntegrationCard, SettingsBlock } from "./settings-ui";

const UTM_FIELDS = [
  { key: "source", label: "Source", placeholder: "linkedin" },
  { key: "medium", label: "Medium", placeholder: "paid_social" },
  { key: "campaign", label: "Campaign", placeholder: "diwali-sellers" },
  { key: "content", label: "Content", placeholder: "carousel-a" },
] as const;

const THEMES = [
  { value: "auto", label: "Visitor's setting" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

const noop = () => () => {};

function clip(value: string | undefined) {
  return value?.trim().slice(0, LEAD_LIMITS.utm) ?? "";
}

/**
 * The embed loads the form itself so it can pass the host page's URL, referrer
 * and UTM tags, which an iframe can't see on its own.
 */
function embedSnippet(src: string, origin: string) {
  return `<iframe id="hypedrive-demo" title="Book a demo with Hypedrive" style="width:100%;min-height:640px;border:0" loading="lazy"></iframe>
<script>
  (function () {
    var frame = document.getElementById("hypedrive-demo");
    var url = new URL(${JSON.stringify(src)});
    new URLSearchParams(location.search).forEach(function (value, key) {
      if (key.indexOf("utm_") === 0) url.searchParams.set(key, value);
    });
    url.searchParams.set("page", location.href);
    if (document.referrer) url.searchParams.set("ref", document.referrer);
    frame.src = url.toString();
    window.addEventListener("message", function (event) {
      if (event.origin !== ${JSON.stringify(origin)}) return;
      if (event.data && event.data.type === ${JSON.stringify(EMBED_HEIGHT_MESSAGE)}) {
        frame.style.height = event.data.height + "px";
      }
    });
  })();
</script>`;
}

/** Public demo form: a tagged link for campaigns and an iframe snippet for the website. */
export default function DemoFormCard() {
  const id = useId();
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const [values, setValues] = useState<Utm>({});
  const [theme, setTheme] = useState("auto");
  const tagged = UTM_FIELDS.some((field) => clip(values[field.key]));

  const { link, embed } = useMemo(() => {
    const url = new URL("/demo", origin || "http://localhost");
    for (const field of UTM_FIELDS) {
      const value = clip(values[field.key]);
      if (value) url.searchParams.set(`utm_${field.key}`, value);
    }
    const link = url.toString();
    url.searchParams.set("embed", "1");
    if (theme !== "auto") url.searchParams.set("theme", theme);
    return { link, embed: embedSnippet(url.toString(), url.origin) };
  }, [origin, values, theme]);

  return (
    <IntegrationCard
      title="Demo form"
      description="The public form at /demo creates a lead, assigns an owner and starts the SLA clock. Tag links per campaign so reports show where leads came from."
      action={
        <a
          href={link}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "secondary", size: "xs" })}
        >
          Open form
        </a>
      }
    >
      <SettingsBlock className="gap-4">
        <div className="flex h-6 items-center gap-3">
          <span className="lead-style min-w-0 flex-1">Campaign tags</span>
          {tagged && (
            <Button variant="ghost" size="xs" onClick={() => setValues({})}>
              Clear
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {UTM_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`${id}-${field.key}`}
            >
              <Input
                id={`${id}-${field.key}`}
                value={values[field.key] ?? ""}
                maxLength={LEAD_LIMITS.utm}
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
        </div>
        <Field label="Link" htmlFor={`${id}-link`}>
          <CopyField id={`${id}-link`} label="Demo form link" value={link} />
        </Field>
      </SettingsBlock>
      <SettingsBlock>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="lead-style">Embed on a website</span>
            <span className="caption-style text-fg-tertiary leading-snug">
              Paste where the form should appear. It resizes to fit and keeps
              the page&apos;s own UTM tags.
            </span>
          </div>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger
              aria-label="Embed theme"
              className="h-control-sm w-auto gap-2 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {THEMES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CopyField
          id={`${id}-embed`}
          label="Embed snippet"
          value={embed}
          multiline
        />
      </SettingsBlock>
    </IntegrationCard>
  );
}
