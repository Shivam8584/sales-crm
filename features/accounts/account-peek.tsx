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
import { DetailHero, DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import AccountVerification from "@/features/enrichment/account-verification";
import MemberPicker from "@/features/members/member-picker";
import PlatformHealthLine from "@/features/platform/platform-health-line";
import Timeline from "@/features/timeline/timeline";
import { useRecordUpdate } from "@/hooks/use-record-update";
import type { LifecycleStage } from "@/lib/domain/enums";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import BuildingIcon from "@/public/assets/icons/building-sm.svg";
import XIcon from "@/public/assets/icons/x.svg";
import AccountLogo from "./account-logo";
import {
  AccountSummary,
  ActivityTrend,
  PipelineHealth,
} from "./account-insights";
import { STAGE_OPTIONS, StageTag } from "./stage";
import { routes } from "@/lib/routes";

type Account = NonNullable<FunctionReturnType<typeof api.accounts.get>>;

/** Quick look at an account from a list: summary, pipeline, activity and key properties. */
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
        <div className="flex min-w-0 items-center gap-2">
          <BuildingIcon aria-hidden className="text-icon size-3.5 shrink-0" />
          <SheetTitle>Account details</SheetTitle>
        </div>
        <SheetDescription className="sr-only">
          Summary, pipeline health, activity and properties for this account
        </SheetDescription>
        <div className="-mr-2 flex items-center gap-1">
          {account && (
            <Button
              variant="ghost"
              size="xs"
              href={routes.account(account._id)}
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
        <PeekBody key={account._id} account={account} onClose={onClose} />
      )}
    </>
  );
}

function PeekBody({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const update = useMutation(api.accounts.update);
  const save = useRecordUpdate(update, account._id);
  const people = useQuery(api.people.list, { accountId: account._id });
  const deals = useQuery(api.deals.list, { accountId: account._id });

  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <DetailHero
        visual={<AccountLogo account={account} size="lg" />}
        title={account.name}
      >
        <OptionPicker
          value={account.stage}
          label="Stage"
          options={STAGE_OPTIONS}
          onChange={(stage) =>
            stage && void save({ stage: stage as LifecycleStage }, "Stage")
          }
          className="mx-0 h-auto rounded-full px-0 hover:bg-transparent data-[state=open]:bg-transparent"
        >
          <StageTag stage={account.stage} />
        </OptionPicker>
        {account.domain && (
          <a
            href={`https://${account.domain}`}
            target="_blank"
            rel="noreferrer"
            className="caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring basis-full truncate rounded-sm outline-none focus-visible:ring-2"
          >
            {account.domain}
          </a>
        )}
      </DetailHero>
      <PlatformHealthLine accountId={account._id} onNavigate={onClose} />
      <AccountSummary people={people} />
      <PipelineHealth accountId={account._id} deals={deals} />
      <ActivityTrend target={{ accountId: account._id }} />
      <DetailSection title="Details" className="gap-2">
        <Properties>
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
      </DetailSection>
      <AccountVerification accountId={account._id} />
      <DetailSection title="Recent activity" divider={false}>
        <Timeline target={{ accountId: account._id }} compact />
      </DetailSection>
    </div>
  );
}

export function PeekSkeleton() {
  return (
    <div aria-busy className="flex flex-col">
      <div className="shadow-divider flex items-center gap-3 px-6 py-5">
        <Skeleton className="size-12 rounded-xl" />
        <span className="flex flex-col gap-2.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28 rounded-full" />
        </span>
      </div>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="shadow-divider flex flex-col gap-4 px-6 py-5"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
