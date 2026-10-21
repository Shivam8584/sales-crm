import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import ContrastTable from "./contrast-table";
import KitDemo from "./kit-demo";
import PrimitivesDemo from "./primitives-demo";
import ThemePanels from "./theme-panels";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

const COLOR_GROUPS = [
  {
    title: "Text & icons",
    tokens: [
      "foreground",
      "fg-secondary",
      "fg-tertiary",
      "fg-disabled",
      "icon",
    ],
  },
  {
    title: "Surfaces",
    tokens: ["background", "card", "popover", "secondary", "muted", "raised"],
  },
  {
    title: "Lines & focus",
    tokens: ["border", "line-strong", "input", "ring"],
  },
  {
    title: "Brand",
    tokens: ["primary", "primary-hover", "selected", "status"],
  },
  {
    title: "Feedback",
    tokens: ["info", "success", "warning", "danger"],
  },
  {
    title: "Data",
    tokens: ["trend", "trend-muted", "track", "switch-track"],
  },
];

const TYPE_SCALE = [
  {
    label: "Display · 28 · Inter Display",
    className: "font-display text-display",
  },
  { label: "2XL · 24 · Inter Display", className: "font-display text-2xl" },
  { label: "H1 · 18 / 500", className: "h1-style" },
  { label: "H2 · 16 / 600", className: "h2-style" },
  { label: "H3 · 14 / 500", className: "h3-style" },
  { label: "Body · 14", className: "p-style" },
  { label: "Lead · 14 / 1", className: "lead-style" },
  { label: "Caption · 12", className: "caption-style" },
  { label: "2XS · 11", className: "text-2xs" },
  { label: "Eyebrow · 12", className: "eyebrow-style" },
];

const SHADOWS = [
  { name: "hairline", className: "bg-card shadow-hairline" },
  { name: "raised", className: "bg-secondary shadow-raised" },
  { name: "card", className: "bg-card shadow-card" },
  { name: "tile", className: "bg-card shadow-tile" },
  { name: "badge", className: "bg-raised shadow-badge" },
  { name: "well", className: "bg-overlay-1 shadow-well" },
  {
    name: "brand",
    className: "bg-primary text-primary-foreground shadow-brand",
  },
  { name: "overlay", className: "bg-popover shadow-overlay" },
];

const RADII = [
  { name: "xs · 2", className: "rounded-xs" },
  { name: "sm · 4", className: "rounded-sm" },
  { name: "md · 6", className: "rounded-md" },
  { name: "lg · 8", className: "rounded-lg" },
  { name: "xl · 12", className: "rounded-xl" },
  { name: "2xl · 16", className: "rounded-2xl" },
  { name: "full", className: "rounded-full" },
];

const CONTROLS = [
  { name: "control-xs · 20", className: "h-control-xs" },
  { name: "control-sm · 24", className: "h-control-sm" },
  { name: "control-md · 30", className: "h-control-md" },
  { name: "control-lg · 36", className: "h-control-lg" },
  { name: "touch · 44", className: "h-touch" },
];

const SPACING = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];

const DURATIONS = [
  {
    name: "instant · 100",
    className: "duration-instant",
    use: "Colour on press",
  },
  {
    name: "fast · 150",
    className: "duration-fast",
    use: "Hover, menus closing",
  },
  {
    name: "base · 200",
    className: "duration-base",
    use: "Menus, popovers, tabs",
  },
  { name: "slow · 250", className: "duration-slow", use: "Dialogs opening" },
  {
    name: "panel · 350",
    className: "duration-panel",
    use: "Sheets sliding in",
  },
];

const EASINGS = [
  { name: "power3-out", className: "ease-power3-out", use: "Things entering" },
  { name: "power4-out", className: "ease-power4-out", use: "Dialogs, pop-ins" },
  { name: "power3-in", className: "ease-power3-in", use: "Things leaving" },
  {
    name: "smooth-in-out",
    className: "ease-smooth-in-out",
    use: "Toggles, thumbs",
  },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="shadow-divider flex scroll-mt-6 flex-col gap-5 py-10"
    >
      <div className="flex flex-col gap-2">
        <h2 id={`${id}-title`} className="font-display text-2xl font-medium">
          {title}
        </h2>
        {description && (
          <p className="text-fg-secondary max-w-2xl">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="caption-style text-fg-tertiary font-mono">{children}</code>
  );
}

const NAV = [
  ["color", "Colour"],
  ["type", "Type"],
  ["space", "Space & size"],
  ["shape", "Radius & elevation"],
  ["motion", "Motion"],
  ["primitives", "Primitives"],
  ["kit", "Kit"],
] as const;

function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <header className="shadow-divider flex flex-col gap-4 py-8">
        <span className="eyebrow-style text-fg-tertiary">Hypedrive CRM</span>
        <h1 className="font-display text-display font-medium">Design system</h1>
        <p className="text-fg-secondary max-w-2xl">
          One Kargul language across the CRM: Marcel&rsquo;s dark data tables
          and detail sheets, the kanban board&rsquo;s cards and chips, and the
          workflow editor&rsquo;s cards, settings sections and controls. Every
          value below is a token; components never use raw colours, and every
          sample renders in both themes.
        </p>
        <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
          {NAV.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="caption-style bg-secondary shadow-raised hover:bg-muted focus-visible:ring-ring duration-fast rounded-full px-3 py-2 transition-colors outline-none focus-visible:ring-2"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="color"
        title="Colour"
        description="Roles, not hues. Text roles meet WCAG AA (4.5:1) on every surface in both themes; the table measures the live tokens. Feedback colours come with a surface, border and foreground for banners and chips."
      >
        <ThemePanels>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <h3 className="text-fg-secondary">{group.title}</h3>
                <ul className="flex flex-col gap-1.5">
                  {group.tokens.map((token) => (
                    <li key={token} className="flex items-center gap-2.5">
                      <span
                        className="shadow-hairline size-6 shrink-0 rounded-md"
                        style={{ background: `var(--${token})` }}
                      />
                      <code className="caption-style font-mono">{token}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <ContrastTable />
        </ThemePanels>
      </Section>

      <Section
        id="type"
        title="Type"
        description="Inter for the interface with its dynamic tracking, Inter Display for headline figures. Numbers in tables, stats and money are tabular so columns line up."
      >
        <ul className="flex flex-col gap-4">
          {TYPE_SCALE.map((item) => (
            <li
              key={item.label}
              className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="w-56 shrink-0">
                <Mono>{item.label}</Mono>
              </span>
              <span className={item.className}>
                Pipeline health at a glance
              </span>
            </li>
          ))}
          <li className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-6">
            <span className="w-56 shrink-0">
              <Mono>tabular-nums</Mono>
            </span>
            <span className="flex flex-col text-right tabular-nums">
              <span>₹1,20,000</span>
              <span>₹ 75,000</span>
              <span>₹11,11,111</span>
            </span>
          </li>
        </ul>
      </Section>

      <Section
        id="space"
        title="Space & size"
        description="A 4px grid. Controls come in four heights; anything tappable on a phone gets at least a 44px target, through its own size or an invisible hit area."
      >
        <div className="flex flex-wrap items-end gap-4">
          {CONTROLS.map((control) => (
            <div key={control.name} className="flex flex-col gap-2">
              <span
                className={`bg-muted shadow-hairline block w-24 rounded-lg ${control.className}`}
              />
              <Mono>{control.name}</Mono>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {SPACING.map((step) => (
            <div key={step} className="flex flex-col items-start gap-2">
              <span
                className="bg-selected block h-3 rounded-xs"
                style={{ width: step * 4 }}
              />
              <Mono>
                {step} · {step * 4}px
              </Mono>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="shape"
        title="Radius & elevation"
        description="Radii are concentric: an inner corner equals the outer corner minus the padding between them (a 16px card with 8px padding holds 8px rows). Elevation comes from shadows that include their own hairline, so surfaces never need a separate border."
      >
        <ThemePanels>
          <div className="flex flex-wrap gap-4">
            {RADII.map((radius) => (
              <div
                key={radius.name}
                className="flex flex-col items-center gap-2"
              >
                <span
                  className={`bg-muted shadow-hairline size-12 ${radius.className}`}
                />
                <Mono>{radius.name}</Mono>
              </div>
            ))}
          </div>
          <div className="bg-card shadow-card flex w-fit flex-col gap-1 rounded-2xl p-2">
            {["Outer 16", "Inner 8 = 16 − 8"].map((label) => (
              <span
                key={label}
                className="caption-style bg-overlay-2 rounded-lg px-3 py-2"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SHADOWS.map((shadow) => (
              <div
                key={shadow.name}
                className={`caption-style flex h-20 items-end rounded-xl p-3 font-mono ${shadow.className}`}
              >
                {shadow.name}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="bg-secondary shadow-raised focus-visible:ring-ring caption-style rounded-full px-3 py-2 outline-none focus-visible:ring-2"
            >
              Tab here: focus ring
            </button>
            <Mono>ring · 2px, brand-tinted, ≥ 3:1</Mono>
          </div>
        </ThemePanels>
      </Section>

      <Section
        id="motion"
        title="Motion"
        description="Short and purposeful: things enter with an ease-out and leave faster than they came. Hover a row to play it. With reduced motion on, transitions and animations collapse to an instant change."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <ul className="flex flex-col gap-3">
            {DURATIONS.map((item) => (
              <li key={item.name} className="group flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <Mono>{item.name}</Mono>
                  <span className="caption-style text-fg-tertiary">
                    {item.use}
                  </span>
                </span>
                <span className="bg-overlay-2 block h-2 overflow-hidden rounded-full">
                  <span
                    className={`bg-selected ease-power3-out block h-full w-1/6 rounded-full transition-[width] group-hover:w-full ${item.className}`}
                  />
                </span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-3">
            {EASINGS.map((item) => (
              <li key={item.name} className="group flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <Mono>{item.name}</Mono>
                  <span className="caption-style text-fg-tertiary">
                    {item.use}
                  </span>
                </span>
                <span className="bg-overlay-2 relative block h-2 overflow-hidden rounded-full">
                  <span
                    className={`bg-selected duration-panel absolute top-0 left-0 block size-2 rounded-full transition-[left] group-hover:left-[calc(100%-0.5rem)] ${item.className}`}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section
        id="primitives"
        title="Primitives"
        description="components/_ui — the pieces every page is built from."
      >
        <ThemePanels>
          <PrimitivesDemo />
        </ThemePanels>
      </Section>

      <Section
        id="kit"
        title="Kit"
        description="Shell, list, detail, record and board: sidebar with eyebrow sections and counts; PageHeader with status, “…” menu and the round global actions; underline views; toolbar filters with Export and one primary action; DataTable with sticky header and first column, row menu and calculation footer; detail sections, big numbers, meters and stat tiles."
      >
        <KitDemo />
      </Section>
    </main>
  );
}

function NotInProduction(): never {
  notFound();
}

/** A local reference for the kit; production builds serve a 404 and leave it out of the bundle. */
export default process.env.NODE_ENV === "development"
  ? DesignSystemPage
  : NotInProduction;
