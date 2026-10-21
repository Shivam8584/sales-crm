"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/_ui/command";
import AccountLogo from "@/features/accounts/account-logo";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";

export type LinkDraft = {
  key: string;
  brand: string;
  linkedId: string | null;
};

/** Picks the CRM account a prospect brand belongs to; undo restores the previous link. */
export default function LinkAccountDialog({
  draft,
  onClose,
}: {
  draft: LinkDraft | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search, 150);
  const accounts = useQuery(
    api.accounts.search,
    draft ? { search: query, selected: draft.linkedId ?? undefined } : "skip",
  );
  const link = useMutation(api.prospecting.linkAccount);

  function close() {
    setSearch("");
    onClose();
  }

  async function choose(accountId: string | null) {
    if (!draft) return;
    const { key, brand } = draft;
    close();
    try {
      const previous = await link({
        key,
        accountId: accountId as Id<"accounts"> | null,
      });
      const name = accounts?.find((item) => item._id === accountId)?.name;
      toast(
        accountId
          ? `${brand} linked to ${name ?? "the account"}`
          : `${brand} unlinked`,
        () => void link({ key, accountId: previous }),
      );
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  return (
    <CommandDialog
      open={draft !== null}
      onOpenChange={(open) => !open && close()}
      title={`Add ${draft?.brand ?? "brand"} to an account`}
      description="Search your accounts and pick the one this brand belongs to."
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder={`Add ${draft?.brand ?? "brand"} to account…`}
        />
        <CommandList>
          <CommandEmpty>No account matches</CommandEmpty>
          {draft?.linkedId && (
            <CommandGroup>
              <CommandItem onSelect={() => void choose(null)}>
                Remove the link
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Accounts">
            {(accounts ?? []).map((account) => (
              <CommandItem
                key={account._id}
                value={`${account.name} ${account.domain ?? ""} ${account._id}`}
                onSelect={() => void choose(account._id)}
              >
                <AccountLogo account={account} size="xs" />
                <span className="min-w-0 flex-1 truncate">{account.name}</span>
                {account.domain && (
                  <span className="caption-style text-fg-tertiary truncate">
                    {account.domain}
                  </span>
                )}
                {account._id === draft?.linkedId && (
                  <span className="caption-style text-fg-tertiary">Linked</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
