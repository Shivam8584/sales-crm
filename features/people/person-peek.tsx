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
import { Properties, Property } from "@/components/record/properties";
import AccountPicker from "@/features/accounts/account-picker";
import { PeekSkeleton } from "@/features/accounts/account-peek";
import MemberPicker from "@/features/members/member-picker";
import Timeline from "@/features/timeline/timeline";
import { useRecordUpdate } from "@/hooks/use-record-update";
import { personName } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";
import XIcon from "@/public/assets/icons/x.svg";
import ContactActions from "./contact-actions";

type Person = NonNullable<FunctionReturnType<typeof api.people.get>>;

/** Quick look at a person from a list: contact details and recent activity. */
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
        <SheetTitle>Person</SheetTitle>
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
      <div className="flex flex-col gap-4 px-6 pt-6 pb-5">
        <div className="flex items-start gap-3.5">
          <Avatar name={name} size="xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2
              title={name}
              className="truncate text-lg leading-6 font-semibold"
            >
              {name}
            </h2>
            <p className="caption-style text-fg-secondary flex min-h-4 min-w-0 items-center gap-1.5">
              {person.title && <span className="truncate">{person.title}</span>}
              {person.title && person.account && <span aria-hidden>·</span>}
              {person.account && (
                <Link
                  href={`/accounts/${person.account._id}`}
                  onClick={onClose}
                  className="hover:text-foreground focus-visible:ring-ring truncate rounded-sm outline-none focus-visible:ring-2"
                >
                  {person.account.name}
                </Link>
              )}
              {!person.title && !person.account && (
                <span className="text-fg-tertiary">No title or account</span>
              )}
            </p>
          </div>
        </div>
        <ContactActions person={person} />
      </div>

      <div className="border-border border-t px-6 py-5">
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
      </div>

      <div className="border-border flex flex-col gap-3 border-t px-6 py-5">
        <h3 className="caption-style text-fg-tertiary font-medium">Activity</h3>
        <Timeline target={{ personId: person._id }} compact />
      </div>
    </div>
  );
}
