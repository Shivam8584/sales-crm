"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import { formatMoney } from "@/lib/domain/money";
import { dateTime, relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";

type Linked = Extract<
  FunctionReturnType<typeof api.platform.forAccount>,
  { steps: unknown }
>;

/** Hypedrive usage for a linked account, in the account sidebar and peek. */
export default function AccountPlatform({
  accountId,
  className,
  divider,
}: {
  accountId: Id<"accounts">;
  className?: string;
  divider?: boolean;
}) {
  const data = useQuery(api.platform.forAccount, { accountId });

  return (
    <DetailSection title="Platform" className={className} divider={divider}>
      {data === undefined ? (
        <div aria-busy className="flex flex-col gap-3 py-2">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-40" />
        </div>
      ) : data.orgId === null ? (
        <p className="text-fg-tertiary -mt-2 text-sm">Not on Hypedrive yet</p>
      ) : (
        <Properties className="-mt-2">
          <PlatformDetails data={data} />
        </Properties>
      )}
    </DetailSection>
  );
}

function PlatformDetails({ data }: { data: Linked }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.orgId);
      toast("Org ID copied");
    } catch {
      toast("Couldn't copy the org ID", { tone: "danger" });
    }
  }

  return (
    <>
      <Property label="Deposits">
        {data.topups > 0 ? (
          <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
            <span className="tabular-nums">{formatMoney(data.deposits)}</span>
            <span className="caption-style text-fg-tertiary truncate">
              {data.topups === 1 ? "1 top-up" : `${data.topups} top-ups`}
            </span>
          </span>
        ) : (
          <span className="text-fg-tertiary text-sm">None yet</span>
        )}
      </Property>
      <Property label="Campaigns live">
        <span
          className={cn(
            "text-sm tabular-nums",
            data.campaignsLive === 0 && "text-fg-tertiary",
          )}
        >
          {data.campaignsLive === 0 ? "None yet" : data.campaignsLive}
        </span>
      </Property>
      <Property label="Last seen">
        {data.lastEventAt ? (
          <time
            dateTime={new Date(data.lastEventAt).toISOString()}
            title={dateTime(data.lastEventAt)}
            className="text-sm"
          >
            {relativeTime(data.lastEventAt)}
          </time>
        ) : (
          <span className="text-fg-tertiary text-sm">—</span>
        )}
      </Property>
      <Property
        label="Org ID"
        action={
          <Tooltip content="Copy org ID">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Copy org ID"
              onClick={() => void copy()}
            >
              <ClipboardIcon aria-hidden className="size-3" />
            </Button>
          </Tooltip>
        }
      >
        <span
          title={data.orgId}
          className="text-fg-secondary truncate font-mono text-xs"
        >
          {data.orgId}
        </span>
      </Property>
    </>
  );
}
