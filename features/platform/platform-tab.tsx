"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Skeleton from "@/components/_ui/skeleton";
import { Campaigns } from "./platform-campaigns";
import { LinkOrg } from "./platform-link-org";
import { Deposits, Events, Listings, Team } from "./platform-sections";
import type { Linked } from "./platform-shared";
import { HeaderStrip } from "./platform-header";

/** The account's life on Hypedrive: health, wallet, campaigns, deposits, listings, team and events. */
export default function PlatformTab({
  accountId,
  accountName,
}: {
  accountId: Id<"accounts">;
  accountName: string;
}) {
  const data = useQuery(api.account360.platform, { accountId });
  if (data === undefined) return <PlatformSkeleton />;
  if (!data.linked) {
    return (
      <LinkOrg
        accountId={accountId}
        accountName={accountName}
        canSync={data.syncMode !== null}
      />
    );
  }
  return <PlatformView accountId={accountId} data={data} />;
}

function PlatformView({
  accountId,
  data,
}: {
  accountId: Id<"accounts">;
  data: Linked;
}) {
  return (
    <div className="flex flex-col gap-10">
      <HeaderStrip accountId={accountId} data={data} />
      <Campaigns campaigns={data.campaigns} />
      <Deposits deposits={data.deposits} />
      <div className="grid gap-10 md:grid-cols-2 md:gap-8">
        <Listings listings={data.listings} />
        <Team members={data.members} />
      </div>
      <Events events={data.events} />
    </div>
  );
}

function PlatformSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-10">
      <Skeleton className="h-52 w-full rounded-xl md:h-36" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    </div>
  );
}
