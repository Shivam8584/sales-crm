"use client";

import { useState } from "react";
import Image from "next/image";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tileVariants = cva(
  "bg-logo-tile text-logo-tile-fg shadow-hairline relative flex shrink-0 items-center justify-center overflow-hidden font-medium select-none",
  {
    variants: {
      size: {
        xs: "size-5 rounded-sm text-[10px]",
        sm: "size-6 rounded-md text-[11px]",
        md: "size-8 rounded-lg text-xs",
        lg: "shadow-tile size-12 rounded-xl text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const IMAGE_PX = { xs: 14, sm: 16, md: 20, lg: 30 } as const;

type AccountLogoProps = VariantProps<typeof tileVariants> & {
  account: { name: string; domain?: string | null; logoUrl?: string | null };
  className?: string;
};

function logoSrc(account: AccountLogoProps["account"]) {
  if (account.logoUrl) return account.logoUrl;
  return account.domain
    ? `/api/logo?domain=${encodeURIComponent(account.domain)}&sz=64`
    : undefined;
}

/** The account's favicon on a neutral tile, falling back to its initial. */
export default function AccountLogo({
  account,
  size = "md",
  className,
}: AccountLogoProps) {
  const src = logoSrc(account);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const px = IMAGE_PX[size ?? "md"];

  return (
    <span aria-hidden className={cn(tileVariants({ size }), className)}>
      {loadedSrc !== src && account.name.trim().slice(0, 1).toUpperCase()}
      {src && failedSrc !== src && (
        <Image
          src={src}
          alt=""
          width={px}
          height={px}
          unoptimized
          draggable={false}
          data-loaded={loadedSrc === src}
          className="duration-base absolute object-contain opacity-0 transition-opacity data-[loaded=true]:opacity-100"
          style={{ width: px, height: px }}
          onError={() => setFailedSrc(src)}
          onLoad={(event) => {
            // Google answers unknown domains with a 16px generic globe.
            if (!account.logoUrl && event.currentTarget.naturalWidth <= 16) {
              setFailedSrc(src);
              return;
            }
            setLoadedSrc(src);
          }}
        />
      )}
    </span>
  );
}
