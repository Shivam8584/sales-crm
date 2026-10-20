import Link from "next/link";
import Avatar from "@/components/_ui/avatar";
import Tag from "@/components/_ui/tag";
import AccountLogo from "@/features/accounts/account-logo";
import { formatMoney } from "@/lib/domain/money";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import { formatDay } from "./format";
import { isOpenStage } from "./stage";
import type { DealRow } from "./use-deal-actions";

/** Board card body: title, account, amount, close date and owner. */
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

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className="lead-style line-clamp-2 font-medium text-pretty break-words">
          {deal.title}
        </span>
        {deal.account ? (
          <Link
            href={`/accounts/${deal.account._id}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className="group/account focus-visible:ring-ring flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2"
          >
            <AccountLogo account={deal.account} size="xs" />
            <span className="caption-style text-fg-secondary group-hover/account:text-foreground duration-fast truncate transition-colors">
              {deal.account.name}
            </span>
          </Link>
        ) : (
          <span className="caption-style text-fg-tertiary">
            Account removed
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="lead-style truncate font-medium tabular-nums">
          {formatMoney(deal.amount)}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {deal.closeDate && (
            <Tag
              size="xs"
              tone={overdue ? "red" : "neutral"}
              title={overdue ? "Close date has passed" : "Expected close date"}
            >
              <CalendarIcon aria-hidden className="size-3" />
              {overdue && <span className="sr-only">Overdue,</span>}
              {formatDay(deal.closeDate)}
            </Tag>
          )}
          {deal.owner && (
            <Avatar
              name={deal.owner.name}
              size="sm"
              label={`Owner: ${deal.owner.name}`}
            />
          )}
        </span>
      </div>
    </>
  );
}
