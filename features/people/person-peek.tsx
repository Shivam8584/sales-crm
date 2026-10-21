"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button from "@/components/_ui/button";
import {
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/_ui/sheet";
import InlineText from "@/components/fields/inline-text";
import Tag, { tagVariants } from "@/components/_ui/tag";
import { DetailHero, DetailSection } from "@/components/record/detail";
import { Properties, Property } from "@/components/record/properties";
import AccountLogo from "@/features/accounts/account-logo";
import { ActivityTrend } from "@/features/accounts/account-insights";
import AccountPicker from "@/features/accounts/account-picker";
import { PeekSkeleton } from "@/features/accounts/account-peek";
import { ErasedTag } from "@/features/consent/erased";
import { StageAndTags } from "@/features/accounts/record-cells";
import MemberPicker from "@/features/members/member-picker";
import GuardedContactActions from "@/features/consent/contact-guard";
import Timeline from "@/features/timeline/timeline";
import { useRecordUpdate } from "@/hooks/use-record-update";
import { personName } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { cn } from "@/lib/utils";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import UsersIcon from "@/public/assets/icons/users.svg";
import XIcon from "@/public/assets/icons/x.svg";

type Person = NonNullable<FunctionReturnType<typeof api.people.get>>;

/** Quick look at a person from a list: contact, activity trend, details and timeline. */
export default function PersonPeek({
  id,
  onClose,
}: {
  id: Id<"people">;
  onClose: () => void;
}) {
  const person = useQuery(api.people.get, { id });

  return (
    <>
      <SheetHeader>
        <div className="flex min-w-0 items-center gap-2">
          <UsersIcon aria-hidden className="text-icon size-3.5 shrink-0" />
          <SheetTitle>Person details</SheetTitle>
        </div>
        <SheetDescription className="sr-only">
          Contact details and recent activity for this person
        </SheetDescription>
        <div className="-mr-2 flex items-center gap-1">
          {person && (
            <Button
              variant="ghost"
              size="xs"
              href={`/people/${person._id}`}
              onClick={onClose}
            >
              Open page
              <ArrowRightIcon aria-hidden className="size-3" />
            </Button>
          )}
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <XIcon aria-hidden className="size-3.5" />
            </Button>
          </SheetClose>
        </div>
      </SheetHeader>
      {person === undefined ? (
        <PeekSkeleton />
      ) : person === null ? (
        <p className="text-fg-secondary px-6 py-6">
          This person no longer exists.
        </p>
      ) : person.erasedAt ? (
        <ErasedBody person={person} />
      ) : (
        <PeekBody key={person._id} person={person} onClose={onClose} />
      )}
    </>
  );
}

function PeekBody({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) {
  const update = useMutation(api.people.update);
  const save = useRecordUpdate(update, person._id);
  const name = personName(person);

  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <DetailHero visual={<Avatar name={name} size="xl" />} title={name}>
        {person.title && (
          <Tag tone="neutral" size="sm">
            {person.title}
          </Tag>
        )}
        {person.account && (
          <Link
            href={`/accounts/${person.account._id}`}
            onClick={onClose}
            className={cn(
              tagVariants({ tone: "neutral", size: "sm" }),
              "hover:text-foreground focus-visible:ring-ring min-w-0 gap-1 pl-0.5 outline-none focus-visible:ring-2",
            )}
          >
            <AccountLogo
              account={person.account}
              size="xs"
              className="size-4"
            />
            <span className="truncate">{person.account.name}</span>
          </Link>
        )}
        <StageAndTags tags={person.tags} max={3} wrap />
        {!person.title && !person.account && person.tags.length === 0 && (
          <span className="caption-style text-fg-tertiary">
            No title or account yet
          </span>
        )}
      </DetailHero>

      <DetailSection title="Contact" className="gap-2">
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
        </Properties>
      </DetailSection>

      <ActivityTrend target={{ personId: person._id }} />

      <DetailSection title="Details" className="gap-2">
        <Properties>
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
      </DetailSection>

      <DetailSection title="Recent activity" divider={false}>
        <Timeline target={{ personId: person._id }} compact />
      </DetailSection>
    </div>
  );
}

function ErasedBody({ person }: { person: Person }) {
  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      <DetailHero
        visual={<Avatar name={personName(person)} size="xl" />}
        title={personName(person)}
      >
        <ErasedTag erasedAt={person.erasedAt!} />
      </DetailHero>
      <DetailSection title="Recent activity" divider={false}>
        <Timeline target={{ personId: person._id }} compact readOnly />
      </DetailSection>
    </div>
  );
}
