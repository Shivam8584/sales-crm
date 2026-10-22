import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Logo from "@/public/assets/images/_common/logo.svg";
import Wordmark from "@/public/assets/images/_common/logo-wordmark.svg";

/** The brand mark; its artwork carries its own tile and shadow, so it is sized by the tile. */
export function LogoTile({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-12 shrink-0", className)}>
      <Logo
        aria-hidden
        className="-mx-1.5 -mt-[1.5px] h-[61.5px] w-15 max-w-none shrink-0 overflow-visible"
      />
    </span>
  );
}

/** Centred column for the screens outside the app: sign-in, invites, blocked access. */
export default function AuthCard({
  title,
  description,
  children,
  footer,
  visual = (
    <Wordmark
      role="img"
      aria-label="Hypedrive"
      className="text-foreground h-6 w-30"
    />
  ),
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Quiet line under the content. */
  footer?: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="rise flex w-full max-w-90 flex-col gap-8">
        <div className="flex flex-col items-center gap-6 text-center">
          {visual}
          <div className="flex flex-col gap-2">
            <h1 className="text-display font-semibold text-balance">{title}</h1>
            {description && (
              <p className="text-body text-fg-secondary text-balance">
                {description}
              </p>
            )}
          </div>
        </div>
        {children}
      </div>
      <p className="caption-style text-fg-tertiary text-center">
        {footer ?? "Hypedrive · Brand pipeline"}
      </p>
    </main>
  );
}
