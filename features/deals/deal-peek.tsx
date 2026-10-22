"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import Skeleton from "@/components/_ui/skeleton";
import { Properties, Property } from "@/components/record/properties";
import AccountLogo from "@/features/accounts/account-logo";
import MemberPicker from "@/features/members/member-picker";
import ProposalSummary from "@/features/proposals/proposal-summary";
import Timeline from "@/features/timeline/timeline";
import { personName } from "@/lib/domain/labels";
import XIcon from "@/public/assets/icons/x.svg";
import {
  DealAmountField,
  DealCloseDateField,
  DealPeopleMenu,
  DealStageControl,
  useDealSave,
} from "./deal-fields";
import type { DealRow } from "./use-deal-actions";
import { routes } from "@/lib/routes";

/** Quick look at a deal from the board: stage, amount, owner and its timeline. */
export default function DealPeek({
  id,
  onClose,
}: {
  id: Id<"deals">;
  onClose: () => void;
}) {
  const deal = useQuery(api.deals.get, { id });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Deal</SheetTitle>
        <SheetDescription className="sr-only">
          Stage, amount, owner and activity for this deal
        </SheetDescription>
        <div className="-mr-2 flex items-center gap-1">
          {deal && (
            <Button
              variant="ghost"
              size="xs"
              href={routes.deal(deal._id)}
              onClick={onClose}
            >
              Open page
            </Button>
          )}
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>
      {deal === undefined ? (
        <div aria-busy className="flex flex-col gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-xl" />
            <span className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-28" />
            </span>
          </div>
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : deal === null ? (
        <p className="text-fg-secondary px-6 py-6">
          This deal no longer exists.
        </p>
      ) : (
        <PeekBody key={deal._id} deal={deal} onClose={onClose} />
      )}
    </>
  );
}

function PeekBody({ deal, onClose }: { deal: DealRow; onClose: () => void }) {
  const save = useDealSave(deal);
  const people = useQuery(api.people.list, { accountId: deal.accountId });
  const onDeal = people?.filter((person) =>
    deal.personIds.includes(person._id),
  );

  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-start gap-3.5 px-6 pt-6 pb-5">
        {deal.account && <AccountLogo account={deal.account} size="lg" />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-lg leading-6 font-medium text-pretty break-words">
            {deal.title}
          </h2>
          {deal.account && (
            <Link
              href={routes.account(deal.account._id)}
              onClick={onClose}
              className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring w-fit max-w-full truncate rounded-sm outline-none focus-visible:ring-2"
            >
              {deal.account.name}
            </Link>
          )}
        </div>
      </div>

      <div className="border-border border-t px-6 py-5">
        <Properties>
          <Property label="Stage">
            <DealStageControl deal={deal} save={save} />
          </Property>
          <Property label="Amount">
            <DealAmountField amount={deal.amount} save={save} />
          </Property>
          <Property label="Owner">
            <MemberPicker
              value={deal.ownerId}
              currentName={deal.owner?.name}
              onChange={(ownerId) =>
                void save({ ownerId: ownerId as Id<"members"> }, "Owner")
              }
            />
          </Property>
          <Property label="Close date">
            <DealCloseDateField deal={deal} save={save} />
          </Property>
          <Property label="People">
            <DealPeopleMenu deal={deal} save={save}>
              <button
                type="button"
                className="hover:bg-overlay-1 data-[state=open]:bg-overlay-2 focus-visible:ring-ring duration-fast -mx-1.5 flex h-7 min-w-0 items-center rounded-md px-1.5 text-left text-sm leading-none transition-colors outline-none focus-visible:ring-2"
              >
                <span
                  className={
                    onDeal?.length ? "truncate" : "text-fg-tertiary truncate"
                  }
                >
                  {onDeal === undefined
                    ? "…"
                    : onDeal.length
                      ? onDeal.map(personName).join(", ")
                      : "Add people"}
                </span>
              </button>
            </DealPeopleMenu>
          </Property>
          <Property label="Proposal">
            <ProposalSummary dealId={deal._id} onNavigate={onClose} />
          </Property>
          {deal.stage === "lost" && deal.lostReason && (
            <Property label="Lost reason">
              <span className="truncate text-sm" title={deal.lostReason}>
                {deal.lostReason}
              </span>
            </Property>
          )}
        </Properties>
      </div>

      <div className="border-border flex flex-col gap-3 border-t px-6 py-5">
        <h3 className="caption-style text-fg-tertiary font-medium">Activity</h3>
        <Timeline target={{ dealId: deal._id }} />
      </div>
    </div>
  );
}
