"use client";

import { useQuery, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import InlineText from "@/components/fields/inline-text";
import OptionPicker from "@/components/fields/option-picker";
import TagsField from "@/components/fields/tags-field";
import { Properties, Property } from "@/components/record/properties";
import { formatTotals } from "@/features/deals/format";
import { isOpenStage } from "@/features/deals/stage";
import MemberPicker from "@/features/members/member-picker";
import Timeline from "@/features/timeline/timeline";
import { useRecordUpdate } from "@/hooks/use-record-update";
import type { LifecycleStage } from "@/lib/domain/enums";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import XIcon from "@/public/assets/icons/x.svg";
import AccountLogo from "./account-logo";
import { STAGE_OPTIONS } from "./stage";

type Account = NonNullable<FunctionReturnType<typeof api.accounts.get>>;

/** Quick look at an account from a list: key properties and recent activity. */
export default function AccountPeek({
  id,
  onClose,
}: {
  id: Id<"accounts">;
  onClose: () => void;
}) {
  const account = useQuery(api.accounts.get, { id });

  return (
    <>
      <SheetHeader>
        <SheetTitle>Account</SheetTitle>
        <SheetDescription className="sr-only">
          Stage, owner and recent activity for this account
        </SheetDescription>
        <div className="-mr-2 flex items-center gap-1">
          {account && (
            <Button
              variant="ghost"
              size="xs"
              href={`/accounts/${account._id}`}
              onClick={onClose}
            >
              Open page
              <ArrowRightIcon aria-hidden className="size-3" />
            </Button>
          )}
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>
      {account === undefined ? (
        <PeekSkeleton />
      ) : account === null ? (
        <p className="text-fg-secondary px-6 py-6">
          This account no longer exists.
        </p>
      ) : (
        <PeekBody key={account._id} account={account} />
      )}
    </>
  );
}

function PeekBody({ account }: { account: Account }) {
  const update = useMutation(api.accounts.update);
  const save = useRecordUpdate(update, account._id);
  const people = useQuery(api.people.list, { accountId: account._id });
  const deals = useQuery(api.deals.list, { accountId: account._id });
  const open = deals?.filter((deal) => isOpenStage(deal.stage));
  const pipeline = open
    ? formatTotals(
        open.map((deal) => deal.amount),
        "",
      )
    : "";

  const summary = [
    people && `${people.length} ${people.length === 1 ? "person" : "people"}`,
    open &&
      `${open.length} open ${open.length === 1 ? "deal" : "deals"}${pipeline ? ` · ${pipeline}` : ""}`,
  ].filter(Boolean);

  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-start gap-3.5 px-6 pt-6 pb-5">
        <AccountLogo account={account} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2
            title={account.name}
            className="truncate text-lg leading-6 font-semibold"
          >
            {account.name}
          </h2>
          <p className="caption-style text-fg-secondary flex min-h-4 items-center gap-1.5">
            {account.domain && (
              <a
                href={`https://${account.domain}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground focus-visible:ring-ring truncate rounded-sm outline-none focus-visible:ring-2"
              >
                {account.domain}
              </a>
            )}
            {account.domain && summary.length > 0 && <span aria-hidden>·</span>}
            <span className="truncate tabular-nums">{summary.join(" · ")}</span>
          </p>
        </div>
      </div>

      <div className="border-border border-t px-6 py-5">
        <Properties>
          <Property label="Stage">
            <OptionPicker
              value={account.stage}
              label="Stage"
              options={STAGE_OPTIONS}
              onChange={(stage) =>
                stage && void save({ stage: stage as LifecycleStage }, "Stage")
              }
            />
          </Property>
          <Property label="Owner">
            <MemberPicker
              value={account.ownerId}
              currentName={account.owner?.name}
              onChange={(ownerId) =>
                void save({ ownerId: ownerId as Id<"members"> }, "Owner")
              }
            />
          </Property>
          <Property label="Website">
            <InlineText
              value={account.domain}
              label="Website"
              type="url"
              placeholder="Add website"
              onSave={(domain) => save({ domain: domain || null }, "Website")}
            />
          </Property>
          <Property label="Tags">
            <TagsField
              value={account.tags}
              label="Tags"
              onChange={(tags) => void save({ tags }, "Tags")}
            />
          </Property>
        </Properties>
      </div>

      <div className="border-border flex flex-col gap-3 border-t px-6 py-5">
        <h3 className="caption-style text-fg-tertiary font-medium">Activity</h3>
        <Timeline target={{ accountId: account._id }} compact />
      </div>
    </div>
  );
}

export function PeekSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-5 px-6 py-6">
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-12 rounded-xl" />
        <span className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
