"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buttonVariants } from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { RecordSection } from "@/components/record/record-layout";
import { Code, CopyField } from "@/features/settings/settings-ui";
import ArrowIcon from "@/public/assets/icons/arrow-right.svg";

/** For an accepted proposal: the JSON an admin approves each campaign with on the platform. */
export default function Handoff({ id }: { id: Id<"proposals"> }) {
  const handoff = useQuery(api.proposals.handoff, { id });
  if (handoff === null) return null;

  return (
    <RecordSection
      title="Admin approval payload"
      action={
        handoff?.reviewUrl && (
          <a
            href={handoff.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Open review queue
            <ArrowIcon aria-hidden className="size-3 -rotate-45" />
          </a>
        )
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-fg-secondary max-w-prose text-sm leading-relaxed">
          Each line is one campaign. When the brand submits it, the admin
          approves it with the <Code>approve</Code> block below as the request
          body and checks the <Code>campaign</Code> settings match.
        </p>
        {handoff === undefined ? (
          <Skeleton className="h-60 w-full rounded-lg" />
        ) : (
          <CopyField
            id={`handoff-${id}`}
            label="Approval payload"
            value={handoff.json}
            multiline
          />
        )}
        <p className="caption-style text-fg-tertiary leading-snug">
          {handoff?.campaignUrlTemplate ? (
            <>
              Approve at <Code>{handoff.campaignUrlTemplate}</Code>.
            </>
          ) : (
            <>
              Set <Code>PLATFORM_ADMIN_URL</Code> on the Convex deployment to
              link the admin&apos;s review queue.
            </>
          )}
        </p>
      </div>
    </RecordSection>
  );
}
