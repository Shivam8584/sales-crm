"use client";

import { useEffect, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import { Page, PageHeader } from "@/components/shell/page";
import { reportError } from "@/lib/monitoring";
import { routes } from "@/lib/routes";

/** `bare` for sections whose layout already draws the page header. */
function Frame({ bare, children }: { bare?: boolean; children: ReactNode }) {
  if (bare) return <>{children}</>;
  return (
    <Page>
      <PageHeader title={<Skeleton className="h-4 w-32" />} />
      {children}
    </Page>
  );
}

export function SectionLoading({ bare }: { bare?: boolean }) {
  return (
    <Frame bare={bare}>
      <div aria-busy className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </Frame>
  );
}

export function SectionError({
  error,
  retry,
  bare,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  bare?: boolean;
}) {
  useEffect(() => reportError(error), [error]);
  return (
    <Frame bare={bare}>
      <EmptyState
        title="Something went wrong"
        description={
          error.digest
            ? `This screen hit an error (ID ${error.digest}). Try again, or head back to Today.`
            : "This screen hit an error. Try again, or head back to Today."
        }
        action={
          <>
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" href={routes.today}>
              Go to Today
            </Button>
          </>
        }
        className="flex-1 justify-center"
      />
    </Frame>
  );
}
