import Link from "next/link";
import AccountLogo from "@/features/accounts/account-logo";
import { formatMoney } from "@/lib/domain/money";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import CalendarIcon from "@/public/assets/icons/calendar.svg";
import UserIcon from "@/public/assets/icons/kanban/user-03.svg";
import { formatDay } from "./format";
import { DEAL_STAGE_BADGE, isOpenStage } from "./stage";
import type { DealRow } from "./use-deal-actions";

const CHIP =
  "text-fg-secondary shadow-hairline inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] leading-none whitespace-nowrap";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Board card body: stage and title, account and age, then amount, owner and close date. */
export default function DealCard({
  deal,
  today,
}: {
  deal: DealRow;
  today: string;
}) {
  const overdue =
    isOpenStage(deal.stage) &&
    deal.closeDate !== null &&
    deal.closeDate < today;
  const { icon: StageIcon, text } = DEAL_STAGE_BADGE[deal.stage];

  return (
    <>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <StageIcon
            aria-hidden
            className={cn("mt-0.75 size-3.5 shrink-0", text)}
          />
          <h3 className="lead-style line-clamp-2 min-w-0 flex-1 leading-5 font-medium text-pretty break-words">
            {deal.title}
          </h3>
        </div>
        <div className="text-fg-tertiary flex min-w-0 items-center gap-2 text-[13px] leading-5">
          {deal.account ? (
            <Link
              href={`/accounts/${deal.account._id}`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              className="hover:text-foreground focus-visible:ring-ring duration-fast -mx-1 flex min-w-0 items-center gap-1.5 rounded-sm px-1 transition-colors outline-none focus-visible:ring-2"
            >
              <AccountLogo account={deal.account} size="xs" />
              <span className="truncate">{deal.account.name}</span>
            </Link>
          ) : (
            <span>Account removed</span>
          )}
          <span
            aria-hidden
            className="bg-fg-disabled size-0.75 shrink-0 rounded-full"
          />
          <span className="shrink-0 whitespace-nowrap">
            Created {shortDate(deal._creationTime)}
          </span>
        </div>
      </div>
      <div className="border-border flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <span
          className={cn(
            CHIP,
            deal.amount.amount
              ? "text-foreground font-medium"
              : "text-fg-tertiary",
          )}
          title={`Amount ${formatMoney(deal.amount)}`}
        >
          <span className="tabular-nums">
            {deal.amount.amount
              ? formatMoney(deal.amount, { compact: true })
              : "No amount"}
          </span>
        </span>
        {deal.owner && (
          <span
            className={cn(CHIP, "max-w-36")}
            title={`Owner ${deal.owner.name}`}
          >
            <UserIcon
              aria-hidden
              className="text-fg-tertiary size-3.5 shrink-0"
            />
            <span className="truncate">{firstName(deal.owner.name)}</span>
          </span>
        )}
        {deal.closeDate &&
          (overdue ? (
            <span
              className={cn(CHIP, "text-danger")}
              title={`Close date ${formatDay(deal.closeDate)} has passed`}
            >
              Overdue
              <span className="text-fg-tertiary tabular-nums">
                {formatDay(deal.closeDate)}
              </span>
            </span>
          ) : (
            <span className={CHIP} title="Expected close date">
              <CalendarIcon aria-hidden className="text-fg-tertiary size-3.5" />
              <span className="tabular-nums">{formatDay(deal.closeDate)}</span>
            </span>
          ))}
      </div>
    </>
  );
}
