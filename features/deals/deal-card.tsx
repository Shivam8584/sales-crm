import Link from "next/link";
import { useCardFields } from "@/components/board/board-prefs";
import Avatar from "@/components/_ui/avatar";
import AccountLogo from "@/features/accounts/account-logo";
import { formatMoney } from "@/lib/domain/money";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { formatDay } from "./format";
import { isOpenStage } from "./stage";
import type { DealRow } from "./use-deal-actions";

export const DEAL_CARD_FIELDS = [
  { id: "amount", label: "Amount" },
  { id: "owner", label: "Owner" },
  { id: "close", label: "Close date" },
  { id: "account", label: "Account" },
];

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export default function DealCard({
  deal,
  today,
}: {
  deal: DealRow;
  today: string;
}) {
  const show = useCardFields("deals");
  const overdue =
    isOpenStage(deal.stage) &&
    deal.closeDate !== null &&
    deal.closeDate < today;
  const showAmount = show("amount");
  const showOwner = show("owner") && deal.owner;
  const showClose = show("close") && deal.closeDate;

  return (
    <div className="flex flex-col p-3.5">
      <h3 className="text-body line-clamp-2 leading-5 font-medium text-pretty break-words">
        {deal.title}
      </h3>
      {show("account") &&
        (deal.account ? (
          <Link
            href={routes.account(deal.account._id)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className="text-fg-tertiary hover:text-foreground focus-visible:ring-ring duration-fast -mx-1 mt-1.5 flex min-w-0 items-center gap-1.5 self-start rounded-sm px-1 text-sm transition-colors outline-none focus-visible:ring-2"
          >
            <AccountLogo account={deal.account} size="xs" />
            <span className="truncate">{deal.account.name}</span>
          </Link>
        ) : (
          <span className="text-fg-tertiary mt-1.5 text-sm">
            Account removed
          </span>
        ))}
      {(showAmount || showOwner || showClose) && (
        <div className="border-border text-fg-tertiary mt-3 flex items-center gap-2 border-t pt-3 text-sm tabular-nums">
          {showAmount && (
            <span
              className={cn(
                deal.amount.amount && "text-foreground font-semibold",
                deal.amount.amount && deal.stage === "won" && "text-rose",
              )}
              title={`Amount ${formatMoney(deal.amount)}`}
            >
              {deal.amount.amount
                ? formatMoney(deal.amount, { compact: true })
                : "No amount"}
            </span>
          )}
          {showClose && deal.closeDate && (
            <span
              className={cn("ml-auto", overdue && "text-danger")}
              title={
                overdue
                  ? `Close date ${formatDay(deal.closeDate)} has passed`
                  : "Expected close date"
              }
            >
              {overdue && "Overdue "}
              {formatDay(deal.closeDate)}
            </span>
          )}
          {showOwner && deal.owner && (
            <span
              title={`Owner ${deal.owner.name}`}
              className={cn(!(showClose && deal.closeDate) && "ml-auto")}
            >
              <span className="sr-only">{firstName(deal.owner.name)}</span>
              <Avatar name={deal.owner.name} className="size-6 text-[10px]" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
