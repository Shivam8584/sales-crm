"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import InlineText from "@/components/fields/inline-text";
import { Properties, Property } from "@/components/record/properties";
import RecordLayout, {
  RecordHeader,
  RecordSection,
} from "@/components/record/record-layout";
import RecordTabs from "@/components/record/record-tabs";
import {
  useCommandActions,
  type CommandAction,
} from "@/components/shell/command-actions";
import { Page, PageActions, PageHeader } from "@/components/shell/page";
import {
  editRecordTitle,
  useTitleShortcut,
} from "@/features/accounts/use-title-shortcut";
import AccountLogo from "@/features/accounts/account-logo";
import AccountPicker from "@/features/accounts/account-picker";
import MemberPicker from "@/features/members/member-picker";
import RecordTasks from "@/features/tasks/record-tasks";
import { TaskChecklistSkeleton } from "@/features/tasks/task-checklist";
import ProposalTab from "@/features/proposals/proposal-tab";
import Timeline from "@/features/timeline/timeline";
import { personName } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/domain/money";
import { dateTime, relativeTime } from "@/lib/time";
import { useUiStore } from "@/stores/ui-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import ClipboardIcon from "@/public/assets/icons/clipboard.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import XIcon from "@/public/assets/icons/x.svg";
import {
  DealAmountField,
  DealCloseDateField,
  DealPeopleMenu,
  DealStageControl,
  useDealSave,
  useDeleteDeal,
  type SaveDeal,
} from "./deal-fields";
import { isOpenStage } from "./stage";
import type { DealRow } from "./use-deal-actions";

const CRUMBS = [{ label: "Deals", href: "/deals" }];

/** A deal's full record: stage, amount and owner, its timeline, people and tasks. */
export default function DealPage({ id }: { id: Id<"deals"> }) {
  return (
    <Suspense fallback={<DealPageSkeleton />}>
      <DealPageContent id={id} />
    </Suspense>
  );
}

function DealPageContent({ id }: { id: Id<"deals"> }) {
  const deal = useQuery(api.deals.get, { id });
  if (deal === undefined) return <DealPageSkeleton />;
  if (deal === null) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="Not found" />
        <EmptyState
          icon={ClipboardIcon}
          title="This deal doesn't exist"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href="/deals">
              Back to deals
            </Button>
          }
          className="flex-1 justify-center"
        />
      </Page>
    );
  }
  return <DealView key={deal._id} deal={deal} />;
}

function DealView({ deal }: { deal: DealRow }) {
  const save = useDealSave(deal);
  const remove = useDeleteDeal();
  const setCreate = useUiStore((state) => state.setCreate);
  const tasks = useQuery(api.tasks.list, { dealId: deal._id, done: "none" });
  const open = isOpenStage(deal.stage);

  const addTask = () =>
    setCreate({ type: "task", dealId: deal._id, accountId: deal.accountId });

  useTitleShortcut();
  useCommandActions(
    (
      [
        {
          id: "deal-rename",
          label: "Rename deal",
          icon: EditIcon,
          shortcut: "E",
          perform: editRecordTitle,
        },
        open && {
          id: "deal-won",
          label: "Mark deal as won",
          icon: CheckSquareIcon,
          perform: () => void save({ stage: "won" }, "Stage"),
        },
        {
          id: "deal-task",
          label: "New task for deal",
          icon: PlusIcon,
          perform: addTask,
        },
        {
          id: "deal-delete",
          label: "Delete deal",
          icon: TrashIcon,
          perform: () => remove(deal, true),
        },
      ] as (CommandAction | false)[]
    ).filter((action): action is CommandAction => Boolean(action)),
  );

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={deal.title}
        actions={
          <PageActions
            label="Deal actions"
            primaryItem={
              open && {
                label: "Mark won",
                icon: CheckCircleIcon,
                onSelect: () => void save({ stage: "won" }, "Stage"),
              }
            }
            primary={
              open && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void save({ stage: "won" }, "Stage")}
                >
                  Mark won
                </Button>
              )
            }
            actions={[
              { label: "Add task", icon: PlusIcon, onSelect: addTask },
              deal.account && {
                label: "Open account",
                icon: BuildingIcon,
                href: `/accounts/${deal.account._id}`,
              },
              {
                label: "Delete deal",
                icon: TrashIcon,
                tone: "danger",
                separated: true,
                onSelect: () => remove(deal, true),
              },
            ]}
          />
        }
      />
      <RecordLayout
        header={
          <RecordHeader
            visual={
              deal.account ? (
                <AccountLogo account={deal.account} size="lg" />
              ) : (
                <span className="bg-muted size-12 rounded-xl" />
              )
            }
            title={
              <span data-record-title className="flex min-w-0">
                <InlineText
                  value={deal.title}
                  label="Deal title"
                  onSave={(title) => save({ title }, "Title", { inline: true })}
                  inputClassName="font-display h-9 text-2xl font-medium"
                />
              </span>
            }
            subtitle={
              <>
                <DealStageControl deal={deal} save={save} />
                <span className="text-foreground font-medium tabular-nums">
                  {formatMoney(deal.amount)}
                </span>
                {deal.account && (
                  <Link
                    href={`/accounts/${deal.account._id}`}
                    className="hover:text-foreground focus-visible:ring-ring truncate rounded-sm outline-none focus-visible:ring-2"
                  >
                    {deal.account.name}
                  </Link>
                )}
                {deal.owner && <span>Owned by {deal.owner.name}</span>}
              </>
            }
          />
        }
        aside={
          <>
            <Properties title="Deal">
              <Property label="Stage">
                <DealStageControl deal={deal} save={save} />
              </Property>
              <Property label="Amount">
                <DealAmountField amount={deal.amount} save={save} />
              </Property>
              <Property label="Owner">
                <MemberPicker
                  value={deal.ownerId}
                  currentName={deal.owner?.name}
                  onChange={(ownerId) =>
                    void save({ ownerId: ownerId as Id<"members"> }, "Owner")
                  }
                />
              </Property>
              <Property label="Close date">
                <DealCloseDateField deal={deal} save={save} />
              </Property>
              <Property label="Account">
                <AccountPicker
                  value={deal.accountId}
                  currentName={deal.account?.name}
                  onChange={(accountId) =>
                    accountId &&
                    void save(
                      { accountId: accountId as Id<"accounts"> },
                      "Account",
                    )
                  }
                />
              </Property>
              {deal.stage === "lost" && (
                <Property label="Lost reason">
                  <InlineText
                    value={deal.lostReason}
                    label="Lost reason"
                    onSave={(lostReason) =>
                      save({ lostReason }, "Lost reason", { inline: true })
                    }
                  />
                </Property>
              )}
            </Properties>
            <Properties title="Activity">
              <Property label="Created">
                <span className="text-sm" title={dateTime(deal._creationTime)}>
                  {relativeTime(deal._creationTime)}
                </span>
              </Property>
              <Property label="Updated">
                <span className="text-sm" title={dateTime(deal.updatedAt)}>
                  {relativeTime(deal.updatedAt)}
                </span>
              </Property>
              {deal.closedAt && (
                <Property label={deal.stage === "won" ? "Won" : "Lost"}>
                  <span className="text-sm" title={dateTime(deal.closedAt)}>
                    {relativeTime(deal.closedAt)}
                  </span>
                </Property>
              )}
            </Properties>
          </>
        }
      >
        <RecordTabs
          tabs={[
            {
              id: "activity",
              label: "Activity",
              content: <Timeline target={{ dealId: deal._id }} />,
            },
            {
              id: "proposal",
              label: "Proposal",
              content: <ProposalTab deal={deal} />,
            },
            {
              id: "people",
              label: "People",
              count: deal.personIds.length,
              content: <DealPeople deal={deal} save={save} />,
            },
            {
              id: "tasks",
              label: "Tasks",
              count: tasks?.length,
              content: <RecordTasks target={{ dealId: deal._id }} bare />,
            },
          ]}
        />
      </RecordLayout>
    </Page>
  );
}

function DealPeople({ deal, save }: { deal: DealRow; save: SaveDeal }) {
  const people = useQuery(api.people.list, { accountId: deal.accountId });
  const onDeal = people?.filter((person) =>
    deal.personIds.includes(person._id),
  );
  const addButton = (
    <Button variant="ghost" size="xs">
      <PlusIcon aria-hidden className="size-2.5" />
      Add people
    </Button>
  );

  return (
    <RecordSection
      title="People on this deal"
      action={
        onDeal?.length ? (
          <DealPeopleMenu deal={deal} save={save}>
            {addButton}
          </DealPeopleMenu>
        ) : undefined
      }
    >
      {onDeal === undefined ? (
        <TaskChecklistSkeleton rows={2} />
      ) : onDeal.length === 0 ? (
        <EmptyState
          title="Nobody on this deal yet"
          description={`Add the people at ${deal.account?.name ?? "the account"} you're working with.`}
          action={
            <DealPeopleMenu deal={deal} save={save}>
              <Button variant="secondary" size="sm">
                <PlusIcon aria-hidden className="size-3" />
                Add people
              </Button>
            </DealPeopleMenu>
          }
          className="border-border rounded-xl border border-dashed"
        />
      ) : (
        <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-xl border">
          {onDeal.map((person) => (
            <li
              key={person._id}
              className="group/row flex items-center gap-3 px-3 py-2.5"
            >
              <Avatar name={personName(person)} size="md" />
              <Link
                href={`/people/${person._id}`}
                className="focus-visible:ring-ring flex min-w-0 flex-1 flex-col gap-1 rounded-sm outline-none focus-visible:ring-2"
              >
                <span className="lead-style truncate font-medium hover:underline">
                  {personName(person)}
                </span>
                <span className="caption-style text-fg-tertiary truncate">
                  {[person.title, person.email].filter(Boolean).join(" · ") ||
                    "No title or email"}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${personName(person)} from the deal`}
                onClick={() =>
                  void save(
                    {
                      personIds: deal.personIds.filter(
                        (id) => id !== person._id,
                      ),
                    },
                    "People",
                  )
                }
                className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100"
              >
                <XIcon aria-hidden className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );
}

function DealPageSkeleton() {
  return (
    <Page>
      <PageHeader crumbs={CRUMBS} title="" />
      <div
        aria-busy
        className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-8"
      >
        <div className="flex items-center gap-4 lg:col-span-2">
          <Skeleton className="size-12 rounded-xl" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-72" />
          </span>
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-3 max-lg:order-first">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </Page>
  );
}
