"use client";

import { Suspense, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Avatar from "@/components/_ui/avatar";
import Button, { buttonVariants } from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import InlineText from "@/components/fields/inline-text";
import { Properties, Property } from "@/components/record/properties";
import RecordLayout, { RecordHeader } from "@/components/record/record-layout";
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
import Timeline from "@/features/timeline/timeline";
import { RecordAutomations } from "@/features/automations/record-automations";
import PlaybookPicker from "@/features/playbook/playbook-picker";
import AskRecord from "@/features/ai/ask-record";
import { useDraftAction } from "@/features/ai/use-draft-action";
import { usePinAction } from "@/features/pins/use-pins";
import { useRecordUpdate } from "@/hooks/use-record-update";
import { useViewer } from "@/hooks/use-viewer";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import MessageQuestionIcon from "@/public/assets/icons/message-question.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import { ASIDE_SECTION } from "@/features/accounts/account-insights";
import FilesSection from "@/features/files/files-section";
import LeadContactButtons from "./lead-contact";
import { LeadMessage, LeadStatusControl, type Lead } from "./lead-fields";
import { DemoTag, ScoreTag, SourceTag } from "./lead-meta";
import {
  LeadAttribution,
  LeadConsent,
  LeadConversion,
  LeadDetails,
  LeadSummary,
  SpeedToLead,
} from "./lead-sections";
import { useLeadActions } from "./use-lead-actions";
import FollowButton from "@/features/notifications/follow-button";

const CRUMBS = [{ label: "Leads", href: "/pipeline/leads" }];

/** A lead's full record: contact, triage controls, timeline, attribution and consent. */
export default function LeadPage({ id }: { id: Id<"leads"> }) {
  return (
    <Suspense fallback={<LeadPageSkeleton />}>
      <LeadPageContent id={id} />
    </Suspense>
  );
}

function LeadPageContent({ id }: { id: Id<"leads"> }) {
  const lead = useQuery(api.leads.get, { id });
  if (lead === undefined) return <LeadPageSkeleton />;
  if (lead === null) {
    return (
      <Page>
        <PageHeader crumbs={CRUMBS} title="Not found" />
        <EmptyState
          icon={TargetIcon}
          title="This lead doesn't exist"
          description="It may have been deleted, or the link is wrong."
          action={
            <Button variant="secondary" size="sm" href="/pipeline/leads">
              Back to leads
            </Button>
          }
          className="flex-1 justify-center"
        />
      </Page>
    );
  }
  return <LeadView key={lead._id} lead={lead} />;
}

function websiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function LeadView({ lead }: { lead: Lead }) {
  const viewer = useViewer();
  const update = useMutation(api.leads.update);
  const save = useRecordUpdate(update, lead._id);
  const pin = usePinAction({ leadId: lead._id });
  const draft = useDraftAction({ leadId: lead._id });
  const { convert, assign } = useLeadActions();
  const [converting, setConverting] = useState(false);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const converted = lead.status === "converted";

  async function runConvert() {
    setConverting(true);
    if (!(await convert(lead))) setConverting(false);
  }

  function copyLink() {
    void navigator.clipboard
      .writeText(`${window.location.origin}/pipeline/leads/${lead._id}`)
      .then(() => toast("Link copied"));
  }

  const primary = converted ? (
    lead.account && (
      <Button
        variant="primary"
        size="sm"
        href={`/records/accounts/${lead.account._id}`}
        className="max-w-48"
      >
        <span className="truncate">Open {lead.account.name}</span>
      </Button>
    )
  ) : (
    <Button
      variant="primary"
      size="sm"
      loading={converting}
      onClick={() => void runConvert()}
    >
      Convert
    </Button>
  );

  useTitleShortcut();
  useCommandActions(
    (
      [
        {
          id: "lead-rename",
          label: "Rename lead",
          icon: EditIcon,
          shortcut: "E",
          perform: editRecordTitle,
        },
        !converted && {
          id: "lead-convert",
          label: "Convert lead to account",
          icon: BuildingIcon,
          keywords: "account person",
          perform: () => void runConvert(),
        },
        lead.owner?._id !== viewer._id && {
          id: "lead-assign-me",
          label: "Assign lead to me",
          icon: UserPlusIcon,
          perform: () => void assign(lead, viewer._id),
        },
        {
          id: "lead-copy-link",
          label: "Copy link to lead",
          icon: LinkIcon,
          perform: copyLink,
        },
      ] as (CommandAction | false)[]
    ).filter((action): action is CommandAction => Boolean(action)),
  );

  return (
    <Page>
      <PageHeader
        crumbs={CRUMBS}
        title={lead.name}
        actions={
          <>
            <FollowButton target={{ leadId: lead._id }} />
            <PageActions
              primary={primary}
              primaryItem={
                converted
                  ? lead.account && {
                      label: `Open ${lead.account.name}`,
                      icon: BuildingIcon,
                      href: `/records/accounts/${lead.account._id}`,
                    }
                  : {
                      label: "Convert",
                      icon: BuildingIcon,
                      onSelect: () => void runConvert(),
                    }
              }
              label="Lead actions"
              actions={[
                pin,
                draft.action,
                {
                  label: "Playbook",
                  icon: MessageQuestionIcon,
                  onSelect: () => setPlaybookOpen(true),
                },
                lead.owner?._id !== viewer._id && {
                  label: "Assign to me",
                  icon: UserPlusIcon,
                  onSelect: () => void assign(lead, viewer._id),
                },
                { label: "Copy link", icon: LinkIcon, onSelect: copyLink },
              ]}
            />
            {draft.dialog}
            <PlaybookPicker
              open={playbookOpen}
              onOpenChange={setPlaybookOpen}
            />
          </>
        }
      />
      <RecordLayout
        header={
          <RecordHeader
            visual={<Avatar name={lead.name} size="xl" />}
            title={
              <span data-record-title className="flex min-w-0">
                <InlineText
                  value={lead.name}
                  label="Name"
                  onSave={(name) => save({ name }, "Name")}
                  inputClassName="font-display h-9 text-2xl font-medium"
                />
              </span>
            }
            subtitle={
              <>
                <span className="flex min-w-0 flex-wrap items-center gap-0.75 gap-y-1">
                  <LeadStatusControl lead={lead} />
                  <ScoreTag score={lead.score} reasons={lead.scoreReasons} />
                  <SourceTag utm={lead.utm} channel={lead.channel} />
                  {lead.demoAt && <DemoTag at={lead.demoAt} />}
                </span>
                <span className="min-w-0 truncate">
                  {lead.companyName}
                  <span className="text-fg-tertiary">
                    {" "}
                    · {LEAD_KIND_LABEL[lead.kind]}
                  </span>
                </span>
              </>
            }
            actions={<LeadContactButtons lead={lead} compact />}
          />
        }
        aside={
          <>
            <LeadSummary
              lead={lead}
              actions={false}
              className={ASIDE_SECTION}
            />
            <AskRecord
              target={{ leadId: lead._id }}
              noun="lead"
              className={ASIDE_SECTION}
            />
            <SpeedToLead lead={lead} className={ASIDE_SECTION} />
            <LeadDetails lead={lead} className={ASIDE_SECTION} />
            <LeadConversion lead={lead} className={ASIDE_SECTION} />
            <LeadAttribution lead={lead} className={ASIDE_SECTION} />
            <FilesSection
              target={{ leadId: lead._id }}
              className={cn(ASIDE_SECTION, "gap-2")}
            />
            <LeadConsent
              lead={lead}
              className={ASIDE_SECTION}
              divider={false}
            />
          </>
        }
      >
        <RecordTabs
          tabs={[
            {
              id: "activity",
              label: "Activity",
              content: (
                <div className="flex flex-col gap-6">
                  {lead.message && <LeadMessage message={lead.message} />}
                  <Timeline target={{ leadId: lead._id }} />
                </div>
              ),
            },
            {
              id: "contact",
              label: "Contact",
              content: (
                <Properties>
                  <Property label="Name">
                    <InlineText
                      value={lead.name}
                      label="Name"
                      onSave={(name) => save({ name }, "Name")}
                    />
                  </Property>
                  <Property label="Account">
                    <InlineText
                      value={lead.companyName}
                      label="Account name"
                      onSave={(companyName) =>
                        save({ companyName }, "Account name")
                      }
                    />
                  </Property>
                  <Property label="Email">
                    <InlineText
                      value={lead.email ?? null}
                      label="Email"
                      type="email"
                      placeholder="Add email"
                      onSave={(email) =>
                        save({ email: email || null }, "Email")
                      }
                    />
                  </Property>
                  <Property label="Phone">
                    <InlineText
                      value={lead.phone ?? null}
                      label="Phone"
                      type="tel"
                      placeholder="Add phone"
                      display={(phone) => (
                        <span className="tabular-nums">
                          {formatPhone(phone)}
                        </span>
                      )}
                      onSave={(phone) =>
                        save({ phone: phone || null }, "Phone")
                      }
                    />
                  </Property>
                  <Property
                    label="Website"
                    action={
                      lead.website && (
                        <a
                          href={websiteHref(lead.website)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${lead.website}`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "xs",
                          })}
                        >
                          Open
                        </a>
                      )
                    }
                  >
                    <InlineText
                      value={lead.website ?? null}
                      label="Website"
                      type="url"
                      placeholder="Add website"
                      display={(website) =>
                        website.replace(/^https?:\/\//i, "")
                      }
                      onSave={(website) =>
                        save({ website: website || null }, "Website")
                      }
                    />
                  </Property>
                  <Property label="GSTIN">
                    <InlineText
                      value={lead.gstin ?? null}
                      label="GSTIN"
                      placeholder="Add GSTIN"
                      display={(gstin) => (
                        <span className="font-mono text-xs">{gstin}</span>
                      )}
                      onSave={(gstin) =>
                        save({ gstin: gstin || null }, "GSTIN")
                      }
                    />
                  </Property>
                </Properties>
              ),
            },
            {
              id: "automations",
              label: "Sequences",
              content: <RecordAutomations target={{ leadId: lead._id }} />,
            },
          ]}
        />
      </RecordLayout>
    </Page>
  );
}

function LeadPageSkeleton() {
  return (
    <Page>
      <PageHeader crumbs={CRUMBS} title="" />
      <div
        aria-busy
        className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:py-8 @4xl/page:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex items-center gap-4 @4xl/page:col-span-2">
          <Skeleton className="size-10 rounded-full" />
          <span className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </span>
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-3 @max-4xl/page:order-first">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </Page>
  );
}
