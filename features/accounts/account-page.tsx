"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import InlineText from "@/components/fields/inline-text";
import OptionPicker from "@/components/fields/option-picker";
import TagsField from "@/components/fields/tags-field";
import { DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import RecordLayout, { RecordHeader } from "@/components/record/record-layout";
import RecordTabs from "@/components/record/record-tabs";
import { useCommandActions } from "@/components/shell/command-actions";
import {
  Page,
  PageActions,
  PageHeader,
  PageStatus,
} from "@/components/shell/page";
import AccountBrief from "@/features/ai/account-brief";
import { useDraftAction } from "@/features/ai/use-draft-action";
import { useDuplicatesAction } from "@/features/dedupe/use-duplicates-action";
import { useMergedRedirect } from "@/features/dedupe/use-merged-redirect";
import AccountStallBanner from "@/features/activation/account-stall-banner";
import { RecordAutomations } from "@/features/automations/record-automations";
import RecordDeals from "@/features/deals/record-deals";
import AccountVerification from "@/features/enrichment/account-verification";
import CustomFields from "@/features/fields/custom-fields";
import FilesSection from "@/features/files/files-section";
import MemberPicker from "@/features/members/member-picker";
import PeopleList from "@/features/people/people-list";
import AccountPlatform from "@/features/platform/account-platform";
import MarketplaceListings from "@/features/prospecting/marketplace-listings";
import PlatformTab from "@/features/platform/platform-tab";
import FeedbackSection from "@/features/surveys/feedback-section";
import RecordTasks from "@/features/tasks/record-tasks";
import Timeline from "@/features/timeline/timeline";
import { usePinAction } from "@/features/pins/use-pins";
import { useRecordUpdate } from "@/hooks/use-record-update";
import type { LifecycleStage } from "@/lib/domain/enums";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import AccountLogoButton from "./logo-dialog";
import {
  ASIDE_SECTION,
  AccountSummary,
  ActivityTrend,
  LIFTED_SECTION,
  PipelineHealth,
} from "./account-insights";
import ActivationPath from "./activation-path";
import { STAGE_OPTIONS, StageTag } from "./stage";
import { editRecordTitle, useTitleShortcut } from "./use-title-shortcut";
import FollowButton from "@/features/notifications/follow-button";
import { routes } from "@/lib/routes";

const CRUMBS = [
  { label: "Records" },
  { label: "Accounts", href: routes.accounts },
];

export default function AccountPage({ id }: { id: Id<"accounts"> }) {
  const account = useQuery(api.accounts.get, { id });
  useMergedRedirect(account?.mergedInto, "accounts");

  if (account === undefined || account?.mergedInto) {
    return <AccountPageSkeleton />;
  }
  if (account === null) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="Not found" />
        <EmptyState
          icon={BuildingIcon}
          title="This account doesn't exist"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href={routes.accounts}>
              Back to accounts
            </Button>
          }
          className="flex-1 justify-center"
        />
      </Page>
    );
  }
  return <AccountView account={account} />;
}

type Account = NonNullable<FunctionReturnType<typeof api.accounts.get>>;

function AccountView({ account }: { account: Account }) {
  const router = useRouter();
  const update = useMutation(api.accounts.update);
  const setArchived = useMutation(api.accounts.setArchived);
  const save = useRecordUpdate(update, account._id);
  const pin = usePinAction({ accountId: account._id });
  const draft = useDraftAction({ accountId: account._id });
  const duplicates = useDuplicatesAction({ accountId: account._id });
  const setCreate = useUiStore((state) => state.setCreate);
  const people = useQuery(api.people.list, { accountId: account._id });
  const deals = useQuery(api.deals.list, { accountId: account._id });
  const tasks = useQuery(api.tasks.list, {
    accountId: account._id,
    done: "none",
  });
  const archived = Boolean(account.archivedAt);
  useTitleShortcut();

  const addPerson = () => setCreate({ type: "person", accountId: account._id });
  const newDeal = () => setCreate({ type: "deal", accountId: account._id });
  const newTask = () => setCreate({ type: "task", accountId: account._id });

  async function toggleArchived() {
    try {
      await setArchived({ ids: [account._id], archived: !archived });
      if (archived) {
        toast(`${account.name} restored`);
        return;
      }
      toast(
        `${account.name} archived`,
        () => void setArchived({ ids: [account._id], archived: false }),
      );
      router.push(routes.accounts);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  useCommandActions([
    {
      id: "account-rename",
      label: "Rename account",
      icon: EditIcon,
      shortcut: "E",
      perform: editRecordTitle,
    },
    {
      id: "account-person",
      label: "Add person to account",
      icon: UserPlusIcon,
      perform: addPerson,
    },
    {
      id: "account-deal",
      label: "New deal for account",
      icon: TargetIcon,
      perform: newDeal,
    },
    {
      id: "account-task",
      label: "New task for account",
      icon: CheckSquareIcon,
      perform: newTask,
    },
    {
      id: "account-archive",
      label: archived ? "Restore account" : "Archive account",
      icon: TrashIcon,
      perform: () => void toggleArchived(),
    },
  ]);

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={account.name}
        meta={archived && <PageStatus tone="warning">Archived</PageStatus>}
        actions={
          <>
            <FollowButton target={{ accountId: account._id }} />
            <PageActions
              label="Account actions"
              actions={[
                pin,
                draft.action,
                duplicates.action,
                {
                  label: "Add person",
                  icon: UserPlusIcon,
                  onSelect: addPerson,
                },
                { label: "New deal", icon: TargetIcon, onSelect: newDeal },
                { label: "New task", icon: CheckSquareIcon, onSelect: newTask },
                {
                  label: archived ? "Restore account" : "Archive account",
                  icon: TrashIcon,
                  tone: archived ? undefined : "danger",
                  separated: true,
                  onSelect: () => void toggleArchived(),
                },
              ]}
            />
            {draft.dialog}
            {duplicates.dialog}
          </>
        }
      />
      <RecordLayout
        header={
          <div className="flex flex-col gap-5">
            <RecordHeader
              visual={<AccountLogoButton account={account} />}
              title={
                <span data-record-title className="flex min-w-0">
                  <InlineText
                    value={account.name}
                    label="Account name"
                    onSave={(name) => save({ name }, "Name")}
                    inputClassName="text-display lg:text-hero h-auto py-0.5 font-semibold"
                  />
                </span>
              }
              subtitle={
                <>
                  <OptionPicker
                    value={account.stage}
                    label="Stage"
                    options={STAGE_OPTIONS}
                    onChange={(stage) =>
                      stage &&
                      void save({ stage: stage as LifecycleStage }, "Stage")
                    }
                    className="mx-0 h-auto rounded-full px-0 hover:bg-transparent data-[state=open]:bg-transparent"
                  >
                    <StageTag stage={account.stage} />
                  </OptionPicker>
                  {account.domain && (
                    <a
                      href={`https://${account.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground focus-visible:ring-ring min-w-0 truncate rounded-sm outline-none focus-visible:ring-2"
                    >
                      {account.domain}
                    </a>
                  )}
                </>
              }
            />
            {account.platformOrgId && (
              <ActivationPath accountId={account._id} />
            )}
            <AccountStallBanner accountId={account._id} />
          </div>
        }
        aside={
          <>
            <PipelineHealth
              accountId={account._id}
              deals={deals}
              className={LIFTED_SECTION}
              divider={false}
            />
            <AccountBrief accountId={account._id} />
            <AccountSummary people={people} className={ASIDE_SECTION} />
            <ActivityTrend
              target={{ accountId: account._id }}
              className={ASIDE_SECTION}
            />
            <DetailSection
              collapsible
              title="Details"
              className={cn(ASIDE_SECTION, "gap-2")}
            >
              <Properties>
                <Property label="Owner">
                  <MemberPicker
                    value={account.ownerId}
                    currentName={account.owner?.name}
                    onChange={(ownerId) =>
                      void save({ ownerId: ownerId as Id<"members"> }, "Owner")
                    }
                  />
                </Property>
                <Property label="Website">
                  <InlineText
                    value={account.domain}
                    label="Website"
                    type="url"
                    placeholder="Add website"
                    onSave={(domain) =>
                      save({ domain: domain || null }, "Website")
                    }
                  />
                </Property>
                <Property label="Tags">
                  <TagsField
                    value={account.tags}
                    label="Tags"
                    onChange={(tags) => void save({ tags }, "Tags")}
                  />
                </Property>
                <Property label="Last activity">
                  {account.lastActivityAt ? (
                    <Tooltip content={dateTime(account.lastActivityAt)}>
                      <span className="text-sm">
                        {relativeTime(account.lastActivityAt)}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-fg-tertiary text-sm">None yet</span>
                  )}
                </Property>
                <Property label="Created">
                  <Tooltip content={dateTime(account._creationTime)}>
                    <span className="text-sm">
                      {shortDate(account._creationTime)}
                    </span>
                  </Tooltip>
                </Property>
              </Properties>
            </DetailSection>
            <CustomFields
              entity="account"
              target={{ accountId: account._id }}
              values={account.custom}
              className={cn(ASIDE_SECTION, "gap-2")}
            />
            <FilesSection
              target={{ accountId: account._id }}
              className={cn(ASIDE_SECTION, "gap-2")}
            />
            <AccountVerification
              accountId={account._id}
              className={ASIDE_SECTION}
            />
            <AccountPlatform
              accountId={account._id}
              className={ASIDE_SECTION}
            />
            <FeedbackSection
              target={{ accountId: account._id }}
              className={ASIDE_SECTION}
            />
            <MarketplaceListings
              accountId={account._id}
              className={ASIDE_SECTION}
            />
          </>
        }
      >
        <RecordTabs
          tabs={[
            {
              id: "activity",
              label: "Activity",
              content: <Timeline target={{ accountId: account._id }} />,
            },
            {
              id: "platform",
              label: "Platform",
              content: (
                <PlatformTab
                  accountId={account._id}
                  accountName={account.name}
                />
              ),
            },
            {
              id: "people",
              label: "People",
              count: people?.length,
              content: (
                <div className="flex flex-col gap-3">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={addPerson}
                    className="self-end"
                  >
                    Add person
                  </Button>
                  <PeopleList accountId={account._id} />
                </div>
              ),
            },
            {
              id: "deals",
              label: "Deals",
              count: deals?.length,
              content: <RecordDeals accountId={account._id} />,
            },
            {
              id: "tasks",
              label: "Tasks",
              count: tasks?.length,
              content: <RecordTasks target={{ accountId: account._id }} />,
            },
            {
              id: "automations",
              label: "Sequences",
              content: (
                <RecordAutomations target={{ accountId: account._id }} />
              ),
            },
          ]}
        />
      </RecordLayout>
    </Page>
  );
}

function AccountPageSkeleton() {
  return (
    <Page>
      <PageHeader crumbs={CRUMBS} title="" />
      <div
        aria-busy
        className="grid w-full gap-x-8 gap-y-6 px-(--page-x) pt-1 pb-8 @4xl/page:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex items-center gap-4 @4xl/page:col-span-2">
          <Skeleton className="size-12 rounded-xl" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </span>
        </div>
        <div className="flex flex-col gap-5 @4xl/page:order-1">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-3 @4xl/page:order-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    </Page>
  );
}
