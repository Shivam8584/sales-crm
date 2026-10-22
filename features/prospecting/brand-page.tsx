"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import RecordLayout, {
  RecordHeader,
  RecordSection,
} from "@/components/record/record-layout";
import {
  Page,
  PageActions,
  PageHeader,
  PageStatus,
} from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { ASIDE_SECTION } from "@/features/accounts/account-insights";
import { RecordAutomations } from "@/features/automations/record-automations";
import { LEAD_STATUS_LABEL } from "@/lib/domain/labels";
import { formatCount, marketplaceName } from "@/lib/domain/prospecting";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import AutomationIcon from "@/public/assets/icons/automation.svg";
import BuildingIcon from "@/public/assets/icons/building.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import EyeIcon from "@/public/assets/icons/eye.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import ListingList from "./listing-list";
import { useProspectActions } from "./prospect-actions";
import { MarketplaceChips, ScoreTag } from "./prospect-cells";
import { routes } from "@/lib/routes";

const CRUMBS = [
  { label: "Pipeline" },
  { label: "Prospecting", href: routes.prospecting },
];

const BENCHMARK_SOURCE = {
  set: "Set on the source",
  category: "Category leaders",
  watchlist: "Leaders in the source",
} as const;

type Brand = NonNullable<FunctionReturnType<typeof api.prospecting.brand>>;

/** One prospect brand: why it scores, its listings and what the CRM knows about it. */
export default function BrandPage({ brandKey }: { brandKey: string }) {
  const brand = useQuery(api.prospecting.brand, { key: brandKey });
  if (brand === undefined) return <BrandSkeleton />;
  if (brand === null) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="Not found" />
        <EmptyState
          icon={EyeIcon}
          title="No watched products for this brand"
          description="Its products may have been removed from every source."
          action={
            <Button variant="secondary" size="sm" href={routes.prospecting}>
              Back to prospecting
            </Button>
          }
          className="flex-1 justify-center"
        />
      </Page>
    );
  }
  return <BrandView brand={brand} />;
}

function BrandView({ brand }: { brand: Brand }) {
  const actions = useProspectActions();
  const refresh = useMutation(api.prospecting.refresh);
  const openLead = brand.lead?.open ? brand.lead : null;
  const top = brand.items.find((item) => item._id === brand.topProductId);
  const watchlists = [...new Set(brand.items.map((item) => item.watchlist))];

  async function checkNow() {
    try {
      const queued = await refresh({
        productIds: brand.items.map((item) => item._id),
      });
      toast(
        queued
          ? `Checking ${queued} ${queued === 1 ? "listing" : "listings"} now`
          : "These listings are already being checked",
        { tone: queued ? "success" : "info" },
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  async function copyTalkingPoint() {
    if (!brand.talkingPoint) return;
    try {
      await navigator.clipboard.writeText(brand.talkingPoint);
      toast("Talking point copied");
    } catch {
      toast("Couldn't copy. Select the text instead.", { tone: "danger" });
    }
  }

  const primary = openLead ? (
    <Button variant="primary" size="sm" href={routes.lead(openLead._id)}>
      Open lead
    </Button>
  ) : (
    <Button
      variant="primary"
      size="sm"
      onClick={() => actions.createLead(brand)}
    >
      Create lead
    </Button>
  );

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={brand.brand}
        meta={
          brand.mode === "sandbox" && (
            <PageStatus tone="warning">Sandbox data</PageStatus>
          )
        }
        actions={
          <PageActions
            label="Brand actions"
            primary={primary}
            primaryItem={
              openLead
                ? {
                    label: "Open lead",
                    icon: TargetIcon,
                    href: routes.lead(openLead._id),
                  }
                : {
                    label: "Create lead",
                    icon: TargetIcon,
                    onSelect: () => actions.createLead(brand),
                  }
            }
            actions={[
              {
                label:
                  brand.account?.via === "linked"
                    ? "Change account"
                    : "Add to account",
                icon: BuildingIcon,
                onSelect: () => actions.addToAccount(brand),
              },
              {
                label: "Add to automation",
                icon: AutomationIcon,
                onSelect: () => actions.addToAutomation(brand),
              },
              {
                label: "Check listings now",
                icon: ClockIcon,
                separated: true,
                onSelect: () => void checkNow(),
              },
            ]}
          />
        }
      />
      <RecordLayout
        header={
          <RecordHeader
            visual={
              <AccountLogo
                account={{
                  name: brand.brand,
                  domain: brand.account?.domain,
                  logoUrl: brand.account?.logoUrl,
                }}
                size="lg"
              />
            }
            title={brand.brand}
            subtitle={
              <>
                <ScoreTag score={brand.score} reasons={brand.reasons} />
                <span className="tabular-nums">
                  {brand.products}{" "}
                  {brand.products === 1 ? "listing" : "listings"}
                </span>
                <MarketplaceChips slugs={brand.marketplaces} max={4} />
              </>
            }
          />
        }
        aside={
          <>
            <DetailSection
              title="In your CRM"
              className={cn(ASIDE_SECTION, "gap-2")}
            >
              <Properties>
                <Property label="Account">
                  {brand.account ? (
                    <Link
                      href={routes.account(brand.account._id)}
                      className="hover:text-foreground focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-sm text-sm outline-none focus-visible:ring-2"
                    >
                      <AccountLogo account={brand.account} size="xs" />
                      <span className="truncate">{brand.account.name}</span>
                      {brand.account.via === "matched" && (
                        <Tooltip content="Matched by name or website. Add to an account to pin it.">
                          <span className="caption-style text-fg-tertiary shrink-0">
                            Matched
                          </span>
                        </Tooltip>
                      )}
                    </Link>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="-mx-2"
                      onClick={() => actions.addToAccount(brand)}
                    >
                      Add to account
                    </Button>
                  )}
                </Property>
                <Property label="Lead">
                  {brand.lead ? (
                    <Link
                      href={routes.lead(brand.lead._id)}
                      className="hover:text-foreground focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-sm text-sm outline-none focus-visible:ring-2"
                    >
                      <span className="truncate">{brand.lead.name}</span>
                      <span className="caption-style text-fg-tertiary shrink-0">
                        {LEAD_STATUS_LABEL[brand.lead.status]}
                      </span>
                    </Link>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="-mx-2"
                      onClick={() => actions.createLead(brand)}
                    >
                      Create lead
                    </Button>
                  )}
                </Property>
              </Properties>
            </DetailSection>
            {top?.benchmark && (
              <DetailSection
                title="Benchmark"
                className={cn(ASIDE_SECTION, "gap-2")}
              >
                <Properties>
                  <Property label="Ratings">
                    <span className="text-sm tabular-nums">
                      {formatCount(top.benchmark.ratings)}
                    </span>
                  </Property>
                  <Property label="From">
                    <span className="truncate text-sm">
                      {BENCHMARK_SOURCE[top.benchmark.source]}
                    </span>
                  </Property>
                  <Property label="Compared with">
                    <span className="text-sm tabular-nums">
                      {top.benchmark.peers}{" "}
                      {top.benchmark.peers === 1 ? "product" : "products"}
                    </span>
                  </Property>
                  <Property label="Leaders' pace">
                    <span className="text-sm tabular-nums">
                      {top.benchmark.leaderVelocity === null
                        ? "Not known yet"
                        : `${top.benchmark.leaderVelocity} a week`}
                    </span>
                  </Property>
                </Properties>
              </DetailSection>
            )}
            <DetailSection
              title="Tracking"
              className={cn(ASIDE_SECTION, "gap-2")}
              divider={false}
            >
              <Properties>
                <Property label="Sources">
                  <span
                    className="truncate text-sm"
                    title={watchlists.join(", ")}
                  >
                    {watchlists.join(", ")}
                  </span>
                </Property>
                <Property label="Last check">
                  {brand.checkedAt ? (
                    <Tooltip content={dateTime(brand.checkedAt)}>
                      <span className="text-sm">
                        {relativeTime(brand.checkedAt)}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-fg-tertiary text-sm">Not yet</span>
                  )}
                </Property>
              </Properties>
            </DetailSection>
          </>
        }
      >
        <RecordSection title="Why this brand">
          <div className="flex flex-col gap-4">
            {brand.talkingPoint ? (
              <div className="flex items-start gap-3">
                <p className="text-foreground min-w-0 flex-1 text-sm leading-relaxed text-pretty">
                  “{brand.talkingPoint}”
                </p>
                <Tooltip content="Copy talking point">
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label="Copy talking point"
                    onClick={() => void copyTalkingPoint()}
                  >
                    <ClipboardIcon aria-hidden className="size-3.5" />
                  </Button>
                </Tooltip>
              </div>
            ) : (
              <p className="text-fg-secondary text-sm">
                {brand.score === null
                  ? "Not scored yet: the source needs at least three rated products to set a benchmark."
                  : "Every listing is level with its benchmark, so there is no review gap to pitch."}
              </p>
            )}
            {brand.reasons.length > 0 && (
              <ul className="caption-style text-fg-secondary flex flex-col gap-1.5 leading-snug">
                {brand.reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span aria-hidden className="text-fg-tertiary">
                      ·
                    </span>
                    {reason}
                  </li>
                ))}
              </ul>
            )}
            {top && (
              <p className="caption-style text-fg-tertiary">
                Based on {top.title ?? top.identifier} on{" "}
                {marketplaceName(top.marketplace)}, its highest-scoring listing.
              </p>
            )}
          </div>
        </RecordSection>
        <RecordSection title="Listings" count={brand.items.length}>
          <ListingList
            listings={[...brand.items].sort(
              (a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1),
            )}
          />
        </RecordSection>
        <RecordSection title="Sequences">
          {openLead || brand.account ? (
            <RecordAutomations
              target={
                openLead
                  ? { leadId: openLead._id as Id<"leads"> }
                  : { accountId: brand.account!._id as Id<"accounts"> }
              }
            />
          ) : (
            <div className="flex flex-col items-start gap-2">
              <span className="text-fg-tertiary text-sm">
                Not in the CRM yet. Create a lead or add the brand to an account
                to enrol it in a sequence.
              </span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => actions.createLead(brand)}
              >
                Create lead
              </Button>
            </div>
          )}
        </RecordSection>
      </RecordLayout>
      {actions.dialogs}
    </Page>
  );
}

function BrandSkeleton() {
  return (
    <Page>
      <PageHeader crumbs={CRUMBS} title="" />
      <div
        aria-busy
        className="mx-auto grid w-full max-w-6xl gap-x-12 gap-y-8 px-4 pt-6 sm:px-6 lg:pt-8 @4xl/page:grid-cols-[minmax(0,1fr)_19rem]"
      >
        <div className="flex items-center gap-4 @4xl/page:col-span-2">
          <Skeleton className="size-12 rounded-xl" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </span>
        </div>
        <div className="flex flex-col gap-4 @4xl/page:order-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex flex-col gap-3 @4xl/page:order-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </Page>
  );
}
