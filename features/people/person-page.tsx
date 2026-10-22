"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button, { buttonVariants } from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import InlineText from "@/components/fields/inline-text";
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
import AccountLogo from "@/features/accounts/account-logo";
import {
  ASIDE_SECTION,
  ActivityTrend,
} from "@/features/accounts/account-insights";
import AccountPicker from "@/features/accounts/account-picker";
import {
  editRecordTitle,
  useTitleShortcut,
} from "@/features/accounts/use-title-shortcut";
import DinLookup from "@/features/enrichment/din-lookup";
import FeedbackSection from "@/features/surveys/feedback-section";
import { RecordAutomations } from "@/features/automations/record-automations";
import CustomFields from "@/features/fields/custom-fields";
import FilesSection from "@/features/files/files-section";
import MemberPicker from "@/features/members/member-picker";
import RecordTasks from "@/features/tasks/record-tasks";
import Timeline from "@/features/timeline/timeline";
import AskRecord from "@/features/ai/ask-record";
import { useDraftAction } from "@/features/ai/use-draft-action";
import { useDuplicatesAction } from "@/features/dedupe/use-duplicates-action";
import { useMergedRedirect } from "@/features/dedupe/use-merged-redirect";
import { usePinAction } from "@/features/pins/use-pins";
import { useRecordUpdate } from "@/hooks/use-record-update";
import { personName } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { dateTime, relativeTime, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import LinkedInIcon from "@/public/assets/icons/linkedin.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import { ErasedNotice, ErasedTag } from "@/features/consent/erased";
import ConsentRecords from "./consent-records";
import GuardedContactActions from "@/features/consent/contact-guard";
import PersonDeals from "./person-deals";
import { routes } from "@/lib/routes";

type Person = NonNullable<FunctionReturnType<typeof api.people.get>>;

const CRUMBS = [{ label: "Records" }, { label: "People", href: routes.people }];

export default function PersonPage({ id }: { id: Id<"people"> }) {
  const person = useQuery(api.people.get, { id });
  useMergedRedirect(person?.mergedInto, "people");

  if (person === undefined || person?.mergedInto) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="" />
        <div
          aria-busy
          className="grid w-full gap-x-8 gap-y-6 px-(--page-x) pt-1 pb-8 @4xl/page:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div className="flex items-center gap-4 @4xl/page:col-span-2">
            <Skeleton className="size-12 rounded-full" />
            <span className="flex flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-32" />
            </span>
          </div>
          <div className="flex flex-col gap-5 @4xl/page:order-1">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
          <div className="flex flex-col gap-3 @4xl/page:order-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      </Page>
    );
  }
  if (person === null) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="Not found" />
        <EmptyState
          icon={UsersIcon}
          title="This person doesn't exist"
          description="They may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href={routes.people}>
              Back to people
            </Button>
          }
          className="flex-1 justify-center"
        />
      </Page>
    );
  }
  if (person.erasedAt) return <ErasedPersonView person={person} />;
  return <PersonView person={person} />;
}

function ErasedPersonView({ person }: { person: Person }) {
  const name = personName(person);
  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={name}
        meta={<PageStatus tone="neutral">Erased</PageStatus>}
      />
      <RecordLayout
        header={
          <div className="flex flex-col gap-5">
            <RecordHeader
              visual={<Avatar name={name} size="xl" />}
              title={<span data-record-title>{name}</span>}
              subtitle={<ErasedTag erasedAt={person.erasedAt!} />}
            />
            <ErasedNotice />
          </div>
        }
        aside={
          <>
            <ConsentRecords personId={person._id} className={ASIDE_SECTION} />
            <DetailSection
              collapsible
              title="Record"
              className={cn(ASIDE_SECTION, "gap-2")}
              divider={false}
            >
              <Properties>
                <Property label="Added">
                  <Tooltip content={dateTime(person._creationTime)}>
                    <span className="text-sm">
                      {shortDate(person._creationTime)}
                    </span>
                  </Tooltip>
                </Property>
              </Properties>
            </DetailSection>
          </>
        }
      >
        <Timeline target={{ personId: person._id }} readOnly />
      </RecordLayout>
    </Page>
  );
}

function PersonView({ person }: { person: Person }) {
  const router = useRouter();
  const update = useMutation(api.people.update);
  const setArchived = useMutation(api.people.setArchived);
  const save = useRecordUpdate(update, person._id);
  const pin = usePinAction({ personId: person._id });
  const draft = useDraftAction({ personId: person._id });
  const duplicates = useDuplicatesAction({ personId: person._id });
  const setCreate = useUiStore((state) => state.setCreate);
  const deals = useQuery(api.people.deals, { personId: person._id });
  const tasks = useQuery(api.tasks.list, {
    personId: person._id,
    done: "none",
  });
  const name = personName(person);
  const archived = Boolean(person.archivedAt);
  useTitleShortcut();

  const newTask = () =>
    setCreate({
      type: "task",
      personId: person._id,
      accountId: person.account?._id,
    });
  const newDeal = person.account
    ? () => setCreate({ type: "deal", accountId: person.account!._id })
    : null;

  async function toggleArchived() {
    try {
      await setArchived({ ids: [person._id], archived: !archived });
      if (archived) {
        toast(`${name} restored`);
        return;
      }
      toast(
        `${name} archived`,
        () => void setArchived({ ids: [person._id], archived: false }),
      );
      router.push(routes.people);
    } catch (error) {
      toast(readError(error).message, { tone: "danger" });
    }
  }

  useCommandActions([
    {
      id: "person-rename",
      label: "Edit first name",
      icon: EditIcon,
      shortcut: "E",
      perform: editRecordTitle,
    },
    {
      id: "person-task",
      label: `New task for ${name}`,
      icon: CheckSquareIcon,
      perform: newTask,
    },
    ...(newDeal
      ? [
          {
            id: "person-deal",
            label: `New deal for ${person.account!.name}`,
            icon: TargetIcon,
            perform: newDeal,
          },
        ]
      : []),
    {
      id: "person-archive",
      label: archived ? "Restore person" : "Archive person",
      icon: TrashIcon,
      perform: () => void toggleArchived(),
    },
  ]);

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={name}
        meta={archived && <PageStatus tone="warning">Archived</PageStatus>}
        actions={
          <>
            <PageActions
              label="Person actions"
              actions={[
                pin,
                draft.action,
                duplicates.action,
                { label: "New task", icon: CheckSquareIcon, onSelect: newTask },
                newDeal && {
                  label: "New deal",
                  icon: TargetIcon,
                  onSelect: newDeal,
                },
                {
                  label: archived ? "Restore person" : "Archive person",
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
          <RecordHeader
            visual={<Avatar name={name} size="xl" />}
            title={
              <span data-record-title className="flex min-w-0 gap-1.5">
                <InlineText
                  value={person.firstName}
                  label="First name"
                  onSave={(firstName) => save({ firstName }, "First name")}
                  className="shrink-0"
                  inputClassName="text-display lg:text-hero h-auto py-0.5 font-semibold"
                />
                {person.lastName && (
                  <InlineText
                    value={person.lastName}
                    label="Last name"
                    onSave={(lastName) => save({ lastName }, "Last name")}
                    inputClassName="text-display lg:text-hero h-auto py-0.5 font-semibold"
                  />
                )}
              </span>
            }
            subtitle={
              <>
                {person.title && (
                  <span className="truncate">{person.title}</span>
                )}
                {person.account && (
                  <Link
                    href={routes.account(person.account._id)}
                    className="hover:text-foreground focus-visible:ring-ring flex min-w-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2"
                  >
                    <AccountLogo
                      account={person.account}
                      size="xs"
                      className="size-4"
                    />
                    <span className="truncate">{person.account.name}</span>
                  </Link>
                )}
              </>
            }
          />
        }
        aside={
          <>
            <DetailSection
              collapsible
              title="Contact"
              className={cn(ASIDE_SECTION, "gap-2")}
            >
              <GuardedContactActions person={person} className="mb-1" />
              <Properties>
                <Property label="Email">
                  <InlineText
                    value={person.email}
                    type="email"
                    label="Email"
                    placeholder="Add email"
                    onSave={(email) => save({ email: email || null }, "Email")}
                  />
                </Property>
                <Property label="Phone">
                  <InlineText
                    value={person.phone}
                    type="tel"
                    label="Phone"
                    placeholder="Add phone"
                    display={formatPhone}
                    onSave={(phone) => save({ phone: phone || null }, "Phone")}
                  />
                </Property>
                <Property
                  label="LinkedIn"
                  action={
                    person.linkedinUrl && (
                      <Tooltip content="Open profile">
                        <a
                          href={person.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open LinkedIn profile"
                          className={buttonVariants({
                            variant: "ghost",
                            size: "icon-xs",
                          })}
                        >
                          <LinkedInIcon aria-hidden className="size-3" />
                        </a>
                      </Tooltip>
                    )
                  }
                >
                  <InlineText
                    value={person.linkedinUrl}
                    type="url"
                    label="LinkedIn"
                    placeholder="Add profile"
                    display={(url) =>
                      url.replace(/^https:\/\/www\.linkedin\.com/, "")
                    }
                    onSave={(linkedinUrl) =>
                      save({ linkedinUrl: linkedinUrl || null }, "LinkedIn")
                    }
                  />
                </Property>
              </Properties>
            </DetailSection>
            <AskRecord
              target={{ personId: person._id }}
              noun="person"
              className={ASIDE_SECTION}
            />
            <ActivityTrend
              target={{ personId: person._id }}
              className={ASIDE_SECTION}
            />
            <DetailSection
              collapsible
              title="Details"
              className={cn(ASIDE_SECTION, "gap-2")}
            >
              <Properties>
                <Property label="Last name">
                  <InlineText
                    value={person.lastName || null}
                    label="Last name"
                    placeholder="Add last name"
                    onSave={(lastName) => save({ lastName }, "Last name")}
                  />
                </Property>
                <Property label="Title">
                  <InlineText
                    value={person.title}
                    label="Title"
                    placeholder="Add title"
                    onSave={(title) => save({ title: title || null }, "Title")}
                  />
                </Property>
                <Property label="Account">
                  <AccountPicker
                    value={person.account?._id ?? null}
                    currentName={person.account?.name}
                    onChange={(accountId) =>
                      void save(
                        { accountId: (accountId as Id<"accounts">) ?? null },
                        "Account",
                      )
                    }
                  />
                </Property>
                <Property label="Owner">
                  <MemberPicker
                    value={person.owner?._id ?? null}
                    currentName={person.owner?.name}
                    onChange={(ownerId) =>
                      void save({ ownerId: ownerId as Id<"members"> }, "Owner")
                    }
                  />
                </Property>
                <Property label="Tags">
                  <TagsField
                    value={person.tags}
                    label="Tags"
                    onChange={(tags) => void save({ tags }, "Tags")}
                  />
                </Property>
                <Property label="Last activity">
                  {person.lastActivityAt ? (
                    <Tooltip content={dateTime(person.lastActivityAt)}>
                      <span className="text-sm">
                        {relativeTime(person.lastActivityAt)}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-fg-tertiary text-sm">None yet</span>
                  )}
                </Property>
                <Property label="Added">
                  <Tooltip content={dateTime(person._creationTime)}>
                    <span className="text-sm">
                      {shortDate(person._creationTime)}
                    </span>
                  </Tooltip>
                </Property>
              </Properties>
            </DetailSection>
            <CustomFields
              entity="person"
              target={{ personId: person._id }}
              values={person.custom}
              className={cn(ASIDE_SECTION, "gap-2")}
            />
            <FilesSection
              target={{ personId: person._id }}
              className={cn(ASIDE_SECTION, "gap-2")}
            />
            <ConsentRecords personId={person._id} className={ASIDE_SECTION} />
            <DinLookup personId={person._id} className={ASIDE_SECTION} />
            <FeedbackSection
              target={{ personId: person._id }}
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
              content: <Timeline target={{ personId: person._id }} />,
            },
            {
              id: "deals",
              label: "Deals",
              count: deals?.length,
              content: <PersonDeals personId={person._id} onAdd={newDeal} />,
            },
            {
              id: "tasks",
              label: "Tasks",
              count: tasks?.length,
              content: <RecordTasks target={{ personId: person._id }} />,
            },
            {
              id: "automations",
              label: "Sequences",
              content: <RecordAutomations target={{ personId: person._id }} />,
            },
          ]}
        />
      </RecordLayout>
    </Page>
  );
}
