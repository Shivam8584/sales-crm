"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
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
import TagsField from "@/components/fields/tags-field";
import { Properties, Property } from "@/components/record/properties";
import RecordLayout, {
  RecordHeader,
  RecordSection,
} from "@/components/record/record-layout";
import { Page, PageHeader } from "@/components/shell/page";
import AccountPicker from "@/features/accounts/account-picker";
import DinLookup from "@/features/enrichment/din-lookup";
import MemberPicker from "@/features/members/member-picker";
import Timeline from "@/features/timeline/timeline";
import RecordTasks from "@/features/tasks/record-tasks";
import { useRecordUpdate } from "@/hooks/use-record-update";
import { personName } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { relativeTime, shortDate } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import UsersIcon from "@/public/assets/icons/users.svg";
import DotsIcon from "@/public/assets/icons/dots-horizontal.svg";
import MailIcon from "@/public/assets/icons/mail-04.svg";
import PhoneIcon from "@/public/assets/icons/phone.svg";

type Person = NonNullable<FunctionReturnType<typeof api.people.get>>;

const CRUMBS = [{ label: "People", href: "/people" }];

export default function PersonPage({ id }: { id: Id<"people"> }) {
  const person = useQuery(api.people.get, { id });

  if (person === undefined) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="" />
        <div
          aria-busy
          className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-8"
        >
          <Skeleton className="size-12 rounded-full" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-32" />
          </span>
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
            <Button variant="secondary" size="sm" href="/people">
              Back to people
            </Button>
          }
          className="flex-1 justify-center"
        />
      </Page>
    );
  }
  return <PersonView person={person} />;
}

function PersonView({ person }: { person: Person }) {
  const router = useRouter();
  const update = useMutation(api.people.update);
  const setArchived = useMutation(api.people.setArchived);
  const save = useRecordUpdate(update, person._id);
  const name = personName(person);
  const archived = Boolean(person.archivedAt);

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
      router.push("/people");
    } catch (error) {
      toast(readError(error).message);
    }
  }

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={name}
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
                aria-label="Person actions"
              >
                <DotsIcon aria-hidden className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void toggleArchived()}>
                {archived ? "Restore person" : "Archive person"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <RecordLayout
        header={
          <RecordHeader
            visual={<Avatar name={name} size="xl" />}
            title={name}
            subtitle={
              <>
                {person.title && <span>{person.title}</span>}
                {person.account && (
                  <Link
                    href={`/accounts/${person.account._id}`}
                    className="hover:text-foreground"
                  >
                    {person.account.name}
                  </Link>
                )}
              </>
            }
            actions={
              <>
                {person.email && (
                  <Button
                    variant="secondary"
                    size="sm"
                    href={`mailto:${person.email}`}
                  >
                    <MailIcon aria-hidden className="size-3" />
                    Email
                  </Button>
                )}
                {person.phone && (
                  <Button
                    variant="secondary"
                    size="sm"
                    href={`tel:${person.phone}`}
                  >
                    <PhoneIcon aria-hidden className="size-3" />
                    Call
                  </Button>
                )}
              </>
            }
          />
        }
        aside={
          <>
            <Properties title="Details">
              <Property label="First name">
                <InlineText
                  value={person.firstName}
                  label="First name"
                  onSave={(firstName) => save({ firstName }, "First name")}
                />
              </Property>
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
            </Properties>
            <Properties title="Contact">
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
              <Property label="LinkedIn">
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
              <Property label="Tags">
                <TagsField
                  value={person.tags}
                  label="Tags"
                  onChange={(tags) => void save({ tags }, "Tags")}
                />
              </Property>
            </Properties>
            <DinLookup personId={person._id} />
            <Properties title="Activity">
              <Property label="Last activity">
                <span className="text-sm">
                  {person.lastActivityAt
                    ? relativeTime(person.lastActivityAt)
                    : "—"}
                </span>
              </Property>
              <Property label="Added">
                <span className="text-sm">
                  {shortDate(person._creationTime)}
                </span>
              </Property>
            </Properties>
          </>
        }
      >
        <RecordTasks target={{ personId: person._id }} />
        <RecordSection title="Timeline">
          <Timeline target={{ personId: person._id }} />
        </RecordSection>
      </RecordLayout>
    </Page>
  );
}
