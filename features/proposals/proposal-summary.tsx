"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMoney } from "@/lib/domain/money";
import { rateLabel } from "@/lib/domain/pricing";
import { ProposalStatusTag } from "./status";
import { routes } from "@/lib/routes";

/** One line on the deal's proposal for the peek: status, take and margin. */
export default function ProposalSummary({
  dealId,
  onNavigate,
}: {
  dealId: Id<"deals">;
  onNavigate?: () => void;
}) {
  const proposal = useQuery(api.proposals.current, { dealId });
  const href = routes.deal(dealId, "proposal");

  if (proposal === undefined) {
    return <span className="text-fg-tertiary text-sm">…</span>;
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="hover:bg-overlay-1 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm leading-none transition-colors outline-none focus-visible:ring-2"
    >
      {proposal === null ? (
        <span className="text-fg-tertiary truncate">Start a proposal</span>
      ) : (
        <>
          <ProposalStatusTag status={proposal.status} />
          <span
            className="truncate tabular-nums"
            title={`${formatMoney(proposal.take)} take at ${rateLabel(proposal.marginRate)} blended margin`}
          >
            {formatMoney(proposal.take, { compact: true })} take ·{" "}
            <span
              className={
                proposal.needsApproval ? "text-danger" : "text-fg-secondary"
              }
            >
              {rateLabel(proposal.marginRate)}
            </span>
          </span>
        </>
      )}
    </Link>
  );
}
