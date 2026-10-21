import Logo from "@/public/assets/images/_common/logo.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import DemoForm from "./demo-form";
import EmbedResizer from "./embed-resizer";

export type DemoTheme = "light" | "dark" | null;

const POINTS = [
  {
    title: "Real shoppers, verified purchases",
    body: "Creators buy your product on Amazon, Flipkart or your own store, and every order is checked before anyone is paid.",
  },
  {
    title: "Pay only for approved results",
    body: "You approve each post. No subscription, no retainer, no minimum spend.",
  },
  {
    title: "Content you can reuse",
    body: "Creators follow ASCI disclosure rules, so their photos and videos are safe to run in your ads and listings.",
  },
];

const STEPS = [
  "A specialist calls you within one business hour.",
  "A 20-minute walkthrough built around your catalogue.",
  "Launch your first campaign when you're ready.",
];

/** Sets the theme before first paint when a host page asks for one, without touching the visitor's saved preference. */
function ForcedTheme({ theme }: { theme: DemoTheme }) {
  if (!theme) return null;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
      }}
    />
  );
}

function Intro() {
  return (
    <div className="flex flex-col gap-5">
      <p className="eyebrow-style text-fg-tertiary">
        For D2C brands and marketplace sellers
      </p>
      <h1 className="text-display font-semibold tracking-[-0.025em] sm:text-[2.5rem] sm:leading-[1.1]">
        Pay for real shoppers, not reach.
      </h1>
      <p className="text-fg-secondary max-w-[34rem] text-base leading-relaxed">
        Launching a new SKU or growing on Amazon, Flipkart and quick commerce?
        See how Hypedrive puts verified buyers and creator content behind your
        listings.
      </p>
    </div>
  );
}

function Details() {
  return (
    <div className="flex flex-col gap-10">
      <ul className="flex flex-col gap-6">
        {POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-3.5">
            <span className="bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full">
              <CheckCircleIcon aria-hidden className="text-success size-3.5" />
            </span>
            <div className="flex flex-col gap-2 pt-1">
              <h2 className="h3-style">{point.title}</h2>
              <p className="text-fg-secondary">{point.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-border flex flex-col gap-4 border-t pt-8">
        <h2 className="eyebrow-style font-normal">What happens next</h2>
        <ol className="flex flex-col gap-3.5">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3.5">
              <span className="caption-style bg-muted text-fg-secondary shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums">
                {index + 1}
              </span>
              <p className="text-fg-secondary">{step}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Public "Talk to sales" page; `embed` renders only the form for iframing on the marketing site. */
export default function DemoPage({
  embed,
  theme,
}: {
  embed: boolean;
  theme: DemoTheme;
}) {
  if (embed) {
    return (
      <main className="mx-auto w-full max-w-xl p-4 sm:p-6">
        <ForcedTheme theme={theme} />
        <EmbedResizer />
        <DemoForm embed />
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <ForcedTheme theme={theme} />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-5 sm:px-8">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="lead-style font-medium tracking-[-0.01em]">
            Hypedrive
          </span>
          <span className="caption-style text-fg-tertiary">Talk to sales</span>
        </span>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 pt-6 pb-16 sm:px-8 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-12 lg:pt-16">
        <Intro />
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-8">
            <DemoForm />
          </div>
        </div>
        <Details />
      </main>
      <footer className="border-border border-t">
        <p className="caption-style text-fg-tertiary mx-auto w-full max-w-6xl px-5 py-6 leading-snug sm:px-8">
          We use your details only to respond to this request. ©{" "}
          {new Date().getFullYear()} Hypedrive.
        </p>
      </footer>
    </div>
  );
}
