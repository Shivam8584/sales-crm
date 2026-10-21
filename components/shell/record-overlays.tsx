"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { Sheet, SheetContent } from "@/components/_ui/sheet";
import CreateAccountDialog from "@/features/accounts/create-account-dialog";
import CreatePersonDialog from "@/features/people/create-person-dialog";
import CreateLeadDialog from "@/features/leads/create-lead-dialog";
import DealDialog from "@/features/deals/deal-dialog";
import TaskDialog from "@/features/tasks/task-dialog";
import AccountPeek from "@/features/accounts/account-peek";
import PersonPeek from "@/features/people/person-peek";
import LeadPeek from "@/features/leads/lead-peek";
import DealPeek from "@/features/deals/deal-peek";
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
  switch (peek.type) {
    case "account":
      return <AccountPeek id={peek.id as Id<"accounts">} onClose={onClose} />;
    case "person":
      return <PersonPeek id={peek.id as Id<"people">} onClose={onClose} />;
    case "lead":
      return <LeadPeek id={peek.id as Id<"leads">} onClose={onClose} />;
    case "deal":
      return <DealPeek id={peek.id as Id<"deals">} onClose={onClose} />;
  }
}
