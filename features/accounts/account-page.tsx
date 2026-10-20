"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/_ui/dropdown-menu";
import InlineText from "@/components/fields/inline-text";
import OptionPicker from "@/components/fields/option-picker";
import TagsField from "@/components/fields/tags-field";
import { Properties, Property } from "@/components/record/properties";
import RecordLayout, {
  RecordHeader,
  RecordSection,
} from "@/components/record/record-layout";
import { Page, PageHeader } from "@/components/shell/page";
import MemberPicker from "@/features/members/member-picker";
import PeopleList from "@/features/people/people-list";
import Timeline from "@/features/timeline/timeline";
import { useRecordUpdate } from "@/hooks/use-record-update";
import type { LifecycleStage } from "@/lib/domain/enums";
import { readError } from "@/lib/errors";
import { relativeTime, shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import { useUiStore } from "@/stores/ui-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import AccountLogo from "./account-logo";
import { STAGE_OPTIONS, StageTag } from "./stage";

export default function AccountPage({ id }: { id: Id<"accounts"> }) {
  const account = useQuery(api.accounts.get, { id });

  if (account === undefined) return <AccountPageSkeleton />;
  if (account === null) {
    return (
      <Page>
        <PageHeader
          crumbs={[{ label: "Accounts", href: "/accounts" }]}
          title="Not found"
        />
        <EmptyState
          icon={BuildingIcon}
          title="This account doesn't exist"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href="/accounts">
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
  const setCreate = useUiStore((state) => state.setCreate);
  const archived = Boolean(account.archivedAt);

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
      router.push("/accounts");
    } catch (error) {
      toast(readError(error).message);
    }
  }

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: "Accounts", href: "/accounts" }]}
        title={account.name}
        meta={
          archived && (
            <span className="caption-style text-warning ml-1">Archived</span>
          )
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Account actions"
              >
                <DotsIcon aria-hidden className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  setCreate({ type: "person", accountId: account._id })
                }
              >
                Add person
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void toggleArchived()}>
                {archived ? "Restore account" : "Archive account"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <RecordLayout
        header={
          <RecordHeader
            visual={<AccountLogo account={account} size="lg" />}
            title={
              <InlineText
                value={account.name}
                label="Account name"
                onSave={(name) => save({ name }, "Name")}
                inputClassName="h-8 text-xl font-semibold"
              />
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
                  className="mx-0 h-auto px-0 hover:bg-transparent data-[state=open]:bg-transparent"
                >
                  <StageTag stage={account.stage} />
                </OptionPicker>
                {account.domain && (
                  <a
                    href={`https://${account.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground truncate"
                  >
                    {account.domain}
                  </a>
                )}
                {account.owner && <span>Owned by {account.owner.name}</span>}
              </>
            }
          />
        }
        aside={
          <>
            <Properties title="Details">
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
              <Property label="GSTIN">
                <InlineText
                  value={account.gstin}
                  label="GSTIN"
                  placeholder="Add GSTIN"
                  display={(gstin) => (
                    <span className="font-mono">{gstin}</span>
                  )}
                  onSave={(gstin) => save({ gstin: gstin || null }, "GSTIN")}
                />
              </Property>
              {account.panRoot && (
                <Property label="PAN">
                  <span className="font-mono text-sm">{account.panRoot}</span>
                </Property>
              )}
              <Property label="Tags">
                <TagsField
                  value={account.tags}
                  label="Tags"
                  onChange={(tags) => void save({ tags }, "Tags")}
                />
              </Property>
            </Properties>
            <Properties title="Activity">
              <Property label="Last activity">
                <span className="text-sm">
                  {account.lastActivityAt
                    ? relativeTime(account.lastActivityAt)
                    : "—"}
                </span>
              </Property>
              <Property label="Created">
                <span className="text-sm">
                  {shortDate(account._creationTime)}
                </span>
              </Property>
            </Properties>
          </>
        }
      >
        <RecordSection
          title="People"
          action={
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                setCreate({ type: "person", accountId: account._id })
              }
            >
              <PlusIcon aria-hidden className="size-2.5" />
              Add person
            </Button>
          }
        >
          <PeopleList accountId={account._id} />
        </RecordSection>
        <RecordSection title="Timeline">
          <Timeline target={{ accountId: account._id }} />
        </RecordSection>
      </RecordLayout>
    </Page>
  );
}

function AccountPageSkeleton() {
  return (
    <Page>
      <PageHeader
        crumbs={[{ label: "Accounts", href: "/accounts" }]}
        title=""
      />
      <div
        aria-busy
        className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8"
      >
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-xl" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </span>
        </div>
        <Skeleton className="h-28 w-full max-w-2xl rounded-xl" />
      </div>
    </Page>
  );
}
