"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import Kbd from "@/components/_ui/kbd";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/_ui/command";
import AccountLogo from "@/features/accounts/account-logo";
import { personName } from "@/lib/domain/labels";
import { useUiStore } from "@/stores/ui-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import { ALL_NAV_ITEMS } from "./navigation";

export default function CommandMenu() {
  const router = useRouter();
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);
  const setCreate = useUiStore((state) => state.setCreate);
  const accounts = useQuery(api.accounts.list, open ? {} : "skip");
  const people = useQuery(api.people.list, open ? {} : "skip");

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search records, jump to a section or run a command"
    >
      <Command>
        <CommandInput
          placeholder="Search accounts, people or commands…"
          autoFocus
        />
        <CommandList>
          <CommandEmpty>Nothing matches that search.</CommandEmpty>
          <CommandGroup heading="Create">
            <CommandItem
              onSelect={() => run(() => setCreate({ type: "account" }))}
            >
              <PlusIcon aria-hidden className="text-fg-tertiary size-3" />
              New account
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => setCreate({ type: "person" }))}
            >
              <PlusIcon aria-hidden className="text-fg-tertiary size-3" />
              New person
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => setCreate({ type: "lead" }))}
            >
              <PlusIcon aria-hidden className="text-fg-tertiary size-3" />
              New lead
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => setCreate({ type: "deal" }))}
            >
              <PlusIcon aria-hidden className="text-fg-tertiary size-3" />
              New deal
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => setCreate({ type: "task" }))}
            >
              <PlusIcon aria-hidden className="text-fg-tertiary size-3" />
              New task
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Go to">
            {ALL_NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                value={`Go to ${item.label}`}
                onSelect={() => run(() => router.push(item.href))}
              >
                <item.icon aria-hidden className="text-fg-tertiary size-3.5" />
                {item.label}
                <span className="ml-auto flex gap-0.5">
                  <Kbd>G</Kbd>
                  <Kbd>{item.shortcut}</Kbd>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          {accounts && accounts.length > 0 && (
            <CommandGroup heading="Accounts">
              {accounts.map((account) => (
                <CommandItem
                  key={account._id}
                  value={`${account.name} ${account.domain ?? ""} ${account._id}`}
                  onSelect={() =>
                    run(() => router.push(`/accounts/${account._id}`))
                  }
                >
                  <AccountLogo account={account} size="xs" />
                  <span className="truncate">{account.name}</span>
                  {account.domain && (
                    <span className="caption-style text-fg-tertiary ml-auto truncate">
                      {account.domain}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {people && people.length > 0 && (
            <CommandGroup heading="People">
              {people.map((person) => (
                <CommandItem
                  key={person._id}
                  value={`${personName(person)} ${person.email ?? ""} ${person.account?.name ?? ""} ${person._id}`}
                  onSelect={() =>
                    run(() => router.push(`/people/${person._id}`))
                  }
                >
                  <Avatar name={personName(person)} />
                  <span className="truncate">{personName(person)}</span>
                  {person.account && (
                    <span className="caption-style text-fg-tertiary ml-auto truncate">
                      {person.account.name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <CommandFooter>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            to move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            to open
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            to close
          </span>
        </CommandFooter>
      </Command>
    </CommandDialog>
  );
}
