"use client";

import { useEffect, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import { Page, PageHeader } from "@/components/shell/page";
import { reportError } from "@/lib/monitoring";
import { routes } from "@/lib/routes";
import AlertCircleIcon from "@/public/assets/icons/alert-circle.svg";

/** `bare` for sections whose layout already draws the page header. */
function Frame({ bare, children }: { bare?: boolean; children: ReactNode }) {
  if (bare) return <>{children}</>;
  return (
    <Page>
      <PageHeader title={<Skeleton className="my-1 h-9 w-56 lg:h-11" />} />
      {children}
    </Page>
  );
}

export function SectionLoading({ bare }: { bare?: boolean }) {
  return (
    <Frame bare={bare}>
      <div aria-busy className="flex flex-col gap-5 px-(--page-x) pb-8">
        <Skeleton className="h-10 w-full max-w-120 rounded-full" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton
                  className="h-4"
                  style={{ width: `${60 - (index % 3) * 10}%` }}
                />
                <Skeleton className="h-3 w-2/5" />
              </span>
              <Skeleton className="h-4 w-14 max-sm:hidden" />
            </div>
          ))}
        </div>
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
      <div className="px-(--page-x) pb-8">
        <EmptyState
          icon={AlertCircleIcon}
          title="Something went wrong"
          description={
            error.digest
              ? `This screen hit an error (ID ${error.digest}). Try again, or head back to Today.`
              : "This screen hit an error. Try again, or head back to Today."
          }
          action={
            <>
              <Button variant="primary" size="md" onClick={retry}>
                Try again
              </Button>
              <Button variant="secondary" size="md" href={routes.today}>
                Go to Today
              </Button>
            </>
          }
        />
      </div>
    </Frame>
  );
}
