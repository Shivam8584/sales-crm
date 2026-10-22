import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Logo from "@/public/assets/images/_common/logo.svg";

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
  visual = <LogoTile />,
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
      <div className="flex w-full max-w-85 flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          {visual}
          <div className="flex flex-col gap-2">
            <h1 className="text-lg leading-tight font-medium tracking-[-0.01em] text-balance">
              {title}
            </h1>
            {description && (
              <p className="text-fg-tertiary text-balance">{description}</p>
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
