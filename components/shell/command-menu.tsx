"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import {
  DEAL_STAGE_LABEL,
  LEAD_STATUS_LABEL,
  personName,
} from "@/lib/domain/labels";
import { useMobileBreakpoints } from "@/hooks/use-mobile-breakpoints";
import { toast } from "@/stores/toast-store";
import { useUiStore, type CreateDialog } from "@/stores/ui-store";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import SidebarIcon from "@/public/assets/icons/sidebar.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import { toggleSidebarCollapsed } from "@/lib/sidebar-collapse";
import {
  useRegisteredCommandActions,
  type CommandAction,
} from "./command-actions";
import { ALL_NAV_ITEMS } from "./navigation";

const RESULTS_PER_GROUP = 5;
const RECORD_PATH = /^\/(accounts|people|leads|deals)\/[^/]+$/;

const CREATE: { label: string; dialog: NonNullable<CreateDialog> }[] = [
  { label: "New account", dialog: { type: "account" } },
  { label: "New person", dialog: { type: "person" } },
  { label: "New lead", dialog: { type: "lead" } },
  { label: "New deal", dialog: { type: "deal" } },
  { label: "New task", dialog: { type: "task" } },
];

function words(query: string) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** 0 = title starts with the query, 1 = a word starts with it, 2 = contains it, -1 = no match. */
function score(terms: string[], title: string, extra = "") {
  if (terms.length === 0) return 2;
  const haystack = `${title} ${extra}`.toLowerCase();
  if (!terms.every((term) => haystack.includes(term))) return -1;
  const lower = title.toLowerCase();
  const joined = terms.join(" ");
  if (lower.startsWith(joined)) return 0;
  if (lower.split(/\s+/).some((word) => word.startsWith(terms[0]))) return 1;
  return 2;
}

function rank<T>(
  items: T[] | undefined,
  terms: string[],
  key: (item: T) => [title: string, extra?: string],
  limit = Infinity,
) {
  if (!items) return [];
  return items
    .map((item, index) => ({ item, index, score: score(terms, ...key(item)) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

/** ⌘K: contextual actions, record search across every type, create and navigation. */
export default function CommandMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);
  const setCreate = useUiStore((state) => state.setCreate);
  const registered = useRegisteredCommandActions();
  const { belowLg } = useMobileBreakpoints();
  const [search, setSearch] = useState("");
  const deferred = useRef<(() => void) | null>(null);

  const accounts = useQuery(api.accounts.list, open ? {} : "skip");
  const people = useQuery(api.people.list, open ? {} : "skip");
  const leads = useQuery(api.leads.list, open ? {} : "skip");
  const deals = useQuery(api.deals.list, open ? {} : "skip");

  const terms = useMemo(() => words(search), [search]);
  const searching = terms.length > 0;

  const contextual = useMemo<CommandAction[]>(() => {
    const builtIn: CommandAction[] = [];
    if (RECORD_PATH.test(pathname)) {
      builtIn.push({
        id: "copy-link",
        label: "Copy link",
        icon: LinkIcon,
        keywords: "share url",
        perform: () => {
          const url = `${window.location.origin}${pathname}`;
          navigator.clipboard.writeText(url).then(
            () => toast("Link copied"),
            () => toast("Couldn't copy the link", { tone: "danger" }),
          );
        },
      });
    }
    return [...registered, ...builtIn];
  }, [registered, pathname]);

  const actionResults = rank(contextual, terms, (action) => [
    action.label,
    action.keywords,
  ]);
  const accountResults = searching
    ? rank(
        accounts,
        terms,
        (account) => [account.name, account.domain ?? ""],
        RESULTS_PER_GROUP,
      )
    : [];
  const peopleResults = searching
    ? rank(
        people,
        terms,
        (person) => [
          personName(person),
          `${person.email ?? ""} ${person.account?.name ?? ""}`,
        ],
        RESULTS_PER_GROUP,
      )
    : [];
  const leadResults = searching
    ? rank(
        leads?.leads,
        terms,
        (lead) => [lead.name, `${lead.companyName} ${lead.email ?? ""}`],
        RESULTS_PER_GROUP,
      )
    : [];
  const dealResults = searching
    ? rank(
        deals,
        terms,
        (deal) => [deal.title, deal.account?.name ?? ""],
        RESULTS_PER_GROUP,
      )
    : [];
  const createResults = rank(CREATE, terms, (item) => [
    item.label,
    `create add ${item.dialog.type}`,
  ]);
  const navResults = rank(ALL_NAV_ITEMS, terms, (item) => [
    item.label,
    "go to open",
  ]);
  const sidebarResults = rank([{ label: "Toggle sidebar" }], terms, (item) => [
    item.label,
    "collapse expand navigation",
  ]);

  const loading =
    searching &&
    (accounts === undefined ||
      people === undefined ||
      leads === undefined ||
      deals === undefined);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSearch("");
  }

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  /** For actions that move focus, which must wait until the dialog has returned it. */
  function runAfterClose(action: () => void) {
    deferred.current = action;
    onOpenChange(false);
  }

  function go(href: string) {
    run(() => router.push(href));
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search records, jump to a section or run a command"
      onCloseAutoFocus={(event) => {
        const action = deferred.current;
        if (!action) return;
        deferred.current = null;
        event.preventDefault();
        action();
      }}
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search accounts, people, leads, deals or commands…"
          autoFocus
        />
        <CommandList>
          <CommandEmpty>
            {loading ? "Searching…" : "Nothing matches that search."}
          </CommandEmpty>

          {actionResults.length > 0 && (
            <CommandGroup heading="This page">
              {actionResults.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`action:${action.id}`}
                  onSelect={() => runAfterClose(action.perform)}
                >
                  <ItemIcon>
                    {action.icon ? (
                      <action.icon aria-hidden className="size-3.5" />
                    ) : (
                      <PlusIcon aria-hidden className="size-3" />
                    )}
                  </ItemIcon>
                  <span className="truncate">{action.label}</span>
                  {action.shortcut && (
                    <Kbd className="ml-auto">{action.shortcut}</Kbd>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {accountResults.length > 0 && (
            <CommandGroup heading="Accounts">
              {accountResults.map((account) => (
                <CommandItem
                  key={account._id}
                  value={`account:${account._id}`}
                  onSelect={() => go(`/accounts/${account._id}`)}
                >
                  <AccountLogo account={account} size="xs" />
                  <span className="truncate">{account.name}</span>
                  <Hint>{account.domain}</Hint>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {peopleResults.length > 0 && (
            <CommandGroup heading="People">
              {peopleResults.map((person) => (
                <CommandItem
                  key={person._id}
                  value={`person:${person._id}`}
                  onSelect={() => go(`/people/${person._id}`)}
                >
                  <Avatar name={personName(person)} />
                  <span className="truncate">{personName(person)}</span>
                  <Hint>{person.account?.name}</Hint>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {leadResults.length > 0 && (
            <CommandGroup heading="Leads">
              {leadResults.map((lead) => (
                <CommandItem
                  key={lead._id}
                  value={`lead:${lead._id}`}
                  onSelect={() => go(`/leads/${lead._id}`)}
                >
                  <ItemIcon>
                    <TargetIcon aria-hidden className="size-3" />
                  </ItemIcon>
                  <span className="truncate">{lead.name}</span>
                  <Hint>
                    {lead.companyName} · {LEAD_STATUS_LABEL[lead.status]}
                  </Hint>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {dealResults.length > 0 && (
            <CommandGroup heading="Deals">
              {dealResults.map((deal) => (
                <CommandItem
                  key={deal._id}
                  value={`deal:${deal._id}`}
                  onSelect={() => go(`/deals/${deal._id}`)}
                >
                  <ItemIcon>
                    <ClipboardIcon aria-hidden className="size-3" />
                  </ItemIcon>
                  <span className="truncate">{deal.title}</span>
                  <Hint>
                    {deal.account?.name ? `${deal.account.name} · ` : ""}
                    {DEAL_STAGE_LABEL[deal.stage]}
                  </Hint>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {createResults.length > 0 && (
            <CommandGroup heading="Create">
              {createResults.map((item) => (
                <CommandItem
                  key={item.label}
                  value={`create:${item.dialog.type}`}
                  onSelect={() => run(() => setCreate(item.dialog))}
                >
                  <ItemIcon>
                    <PlusIcon aria-hidden className="size-3" />
                  </ItemIcon>
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(navResults.length > 0 || sidebarResults.length > 0) && (
            <CommandGroup heading="Go to">
              {navResults.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`nav:${item.href}`}
                  onSelect={() => go(item.href)}
                >
                  <ItemIcon>
                    <item.icon aria-hidden className="size-3.5" />
                  </ItemIcon>
                  {item.label}
                  <span className="ml-auto flex gap-0.5">
                    <Kbd>G</Kbd>
                    <Kbd>{item.shortcut}</Kbd>
                  </span>
                </CommandItem>
              ))}
              {sidebarResults.length > 0 && !belowLg && (
                <CommandItem
                  value="toggle-sidebar"
                  onSelect={() => run(toggleSidebarCollapsed)}
                >
                  <ItemIcon>
                    <SidebarIcon aria-hidden className="size-3.5" />
                  </ItemIcon>
                  Toggle sidebar
                  <Kbd className="ml-auto">[</Kbd>
                </CommandItem>
              )}
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
          <span className="ml-auto flex items-center gap-1.5 max-sm:hidden">
            <Kbd>Esc</Kbd>
            to close
          </span>
        </CommandFooter>
      </Command>
    </CommandDialog>
  );
}

function ItemIcon({ children }: { children: ReactNode }) {
  return (
    <span className="text-fg-tertiary flex size-5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

function Hint({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <span className="caption-style text-fg-tertiary ml-auto max-w-[50%] shrink-0 truncate pl-3">
      {children}
    </span>
  );
}
