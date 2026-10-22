"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { DetailSection } from "@/components/record/detail";
import { ASIDE_SECTION } from "@/features/accounts/account-insights";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { relativeTime } from "@/lib/time";
import { aiError, useAiEnabled } from "./use-ai";

export default function AccountBrief({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  if (!useAiEnabled()) return null;
  return <Brief accountId={accountId} />;
}

function Brief({ accountId }: { accountId: Id<"accounts"> }) {
  const brief = useQuery(api.ai.brief, { accountId });
  const generate = useAction(api.ai.generateBrief);
  const { belowLg } = useMobileBreakpoints();
  const [generating, setGenerating] = useState(false);

  async function run() {
    setGenerating(true);
    try {
      await generate({ accountId });
    } catch (error) {
      aiError(error, "Couldn't write the brief");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <DetailSection
      collapsible
      defaultOpen={!belowLg}
      title="AI brief"
      className={ASIDE_SECTION}
    >
      {brief === undefined ? (
        <Skeleton className="h-4 w-full" />
      ) : brief ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{brief.summary}</p>
          <p className="caption-style text-fg-secondary">
            <span className="text-fg-tertiary">Next step: </span>
            {brief.nextStep}
          </p>
          {brief.risks.length > 0 && (
            <ul className="caption-style text-fg-secondary list-disc pl-4">
              {brief.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="caption-style text-fg-tertiary">
              Updated {relativeTime(brief.at)}
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={generating}
              onClick={() => void run()}
            >
              {generating ? "Generating…" : "Refresh"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="caption-style text-fg-secondary">No brief yet</p>
          <Button
            variant="secondary"
            size="xs"
            disabled={generating}
            onClick={() => void run()}
          >
            {generating ? "Generating…" : "Generate brief"}
          </Button>
        </div>
      )}
    </DetailSection>
  );
}
