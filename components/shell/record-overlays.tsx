"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import AccountLogo from "@/features/accounts/account-logo";
import CreateAccountDialog from "@/features/accounts/create-account-dialog";
import { StageTag } from "@/features/accounts/stage";
import CreatePersonDialog from "@/features/people/create-person-dialog";
import CreateLeadDialog from "@/features/leads/create-lead-dialog";
import DealDialog from "@/features/deals/deal-dialog";
import TaskDialog from "@/features/tasks/task-dialog";
import Timeline from "@/features/timeline/timeline";
import { personName } from "@/lib/domain/labels";
import { useUiStore, type Peek } from "@/stores/ui-store";

/** Create dialogs and the record peek, opened from anywhere through the UI store. */
export default function RecordOverlays() {
  const create = useUiStore((state) => state.create);
  const setCreate = useUiStore((state) => state.setCreate);
  const peek = useUiStore((state) => state.peek);
  const setPeek = useUiStore((state) => state.setPeek);

  return (
    <>
      <CreateAccountDialog
        open={create?.type === "account"}
        onOpenChange={(open) => !open && setCreate(null)}
      />
      <CreatePersonDialog
        open={create?.type === "person"}
        accountId={create?.type === "person" ? create.accountId : undefined}
        onOpenChange={(open) => !open && setCreate(null)}
      />
      <CreateLeadDialog />
      <DealDialog />
      <TaskDialog />
      <Sheet
        open={peek !== null}
        onOpenChange={(open) => !open && setPeek(null)}
      >
        <SheetContent side="right" className="sm:max-w-130">
          {peek && <PeekBody peek={peek} onClose={() => setPeek(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PeekBody({
  peek,
  onClose,
}: {
  peek: NonNullable<Peek>;
  onClose: () => void;
}) {
  const account = useQuery(
    api.accounts.get,
    peek.type === "account" ? { id: peek.id as Id<"accounts"> } : "skip",
  );
  const person = useQuery(
    api.people.get,
    peek.type === "person" ? { id: peek.id as Id<"people"> } : "skip",
  );
  const record = peek.type === "account" ? account : person;
  const href = `/${peek.type === "account" ? "accounts" : "people"}/${peek.id}`;

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {peek.type === "account" ? "Account" : "Person"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Quick look at the record and its timeline
        </SheetDescription>
        <Button
          variant="secondary"
          size="xs"
          href={href}
          onClick={onClose}
          className="mr-8"
        >
          Open page
        </Button>
      </SheetHeader>
      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {record === undefined ? (
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : record === null ? (
          <p className="text-fg-secondary text-sm">
            This record no longer exists.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {account && peek.type === "account" && (
              <div className="flex items-center gap-3">
                <AccountLogo account={account} size="lg" />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="truncate text-lg font-semibold">
                    {account.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <StageTag stage={account.stage} />
                    {account.owner && (
                      <span className="caption-style text-fg-tertiary">
                        {account.owner.name}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}
            {person && peek.type === "person" && (
              <div className="flex items-center gap-3">
                <Avatar name={personName(person)} size="lg" />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="truncate text-lg font-semibold">
                    {personName(person)}
                  </span>
                  <span className="caption-style text-fg-tertiary truncate">
                    {[person.title, person.account?.name, person.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            )}
            <Timeline
              target={
                peek.type === "account"
                  ? { accountId: peek.id as Id<"accounts"> }
                  : { personId: peek.id as Id<"people"> }
              }
            />
          </div>
        )}
      </div>
    </>
  );
}
