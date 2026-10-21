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
import Timeline from "@/features/timeline/timeline";
import { useRecordUpdate } from "@/hooks/use-record-update";
import { useViewer } from "@/hooks/use-viewer";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/domain/normalize";
import { dateTime } from "@/lib/time";
import { toast } from "@/stores/toast-store";
import BuildingIcon from "@/public/assets/icons/building.svg";
import EditIcon from "@/public/assets/icons/edit.svg";
import LinkIcon from "@/public/assets/icons/link.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import LeadContactButtons from "./lead-contact";
import {
  LeadConsents,
  LeadMessage,
  LeadOwnerPicker,
  LeadStatusControl,
  Value,
  When,
  attributionRows,
  conversionPreview,
  type Lead,
} from "./lead-fields";
import { DemoTag } from "./lead-meta";
import SlaIndicator from "./sla";
import { useLeadActions } from "./use-lead-actions";

const CRUMBS = [{ label: "Leads", href: "/leads" }];

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
            <Button variant="secondary" size="sm" href="/leads">
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
  const { convert, assign } = useLeadActions();
  const [converting, setConverting] = useState(false);
  const converted = lead.status === "converted";

  async function runConvert() {
    setConverting(true);
    if (!(await convert(lead))) setConverting(false);
  }

  function copyLink() {
    void navigator.clipboard
      .writeText(`${window.location.origin}/leads/${lead._id}`)
      .then(() => toast("Link copied"));
  }

  const primary = converted ? (
    lead.account && (
      <Button
        variant="primary"
        size="sm"
        href={`/accounts/${lead.account._id}`}
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

  const attribution = attributionRows(lead);

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
          <PageActions
            primary={primary}
            label="Lead actions"
            actions={[
              lead.owner?._id !== viewer._id && {
                label: "Assign to me",
                icon: UserPlusIcon,
                onSelect: () => void assign(lead, viewer._id),
              },
              { label: "Copy link", icon: LinkIcon, onSelect: copyLink },
            ]}
          />
        }
      />
      <RecordLayout
        header={
          <RecordHeader
            visual={<Avatar name={lead.name} size="lg" />}
            title={
              <span data-record-title className="flex min-w-0">
                <InlineText
                  value={lead.name}
                  label="Name"
                  onSave={(name) => save({ name }, "Name")}
                  inputClassName="h-8 text-xl font-semibold"
                />
              </span>
            }
            subtitle={
              <>
                <span className="min-w-0 truncate">
                  {lead.companyName}
                  <span className="text-fg-tertiary">
                    {" "}
                    · {LEAD_KIND_LABEL[lead.kind]}
                  </span>
                </span>
                <LeadStatusControl lead={lead} />
                <SlaIndicator lead={lead} slaMs={lead.slaMs} />
                {lead.demoAt && <DemoTag at={lead.demoAt} />}
              </>
            }
            actions={<LeadContactButtons lead={lead} compact />}
          />
        }
        aside={
          <>
            <Properties title="Lead">
              <Property label="Status">
                <LeadStatusControl lead={lead} />
              </Property>
              <Property label="Owner">
                <LeadOwnerPicker lead={lead} />
              </Property>
              <Property label="Source">
                <Value>{lead.channel}</Value>
              </Property>
              <Property label="Received">
                <When at={lead._creationTime} />
              </Property>
              <Property label="First touch">
                {lead.firstTouchedAt ? (
                  <When at={lead.firstTouchedAt} />
                ) : (
                  <SlaIndicator lead={lead} slaMs={lead.slaMs} />
                )}
              </Property>
              {lead.demoAt && (
                <Property label="Demo">
                  <Value>{dateTime(lead.demoAt)}</Value>
                </Property>
              )}
            </Properties>
            <Properties title="Conversion">
              {converted ? (
                <>
                  <Property label="Account">
                    {lead.account ? (
                      <Button
                        variant="link"
                        size="none"
                        href={`/accounts/${lead.account._id}`}
                        className="truncate text-sm"
                      >
                        {lead.account.name}
                      </Button>
                    ) : (
                      <Value>{null}</Value>
                    )}
                  </Property>
                  <Property label="Person">
                    {lead.person ? (
                      <Button
                        variant="link"
                        size="none"
                        href={`/people/${lead.person._id}`}
                        className="truncate text-sm"
                      >
                        {lead.person.name}
                      </Button>
                    ) : (
                      <Value>{null}</Value>
                    )}
                  </Property>
                  <Property label="Converted">
                    <When at={lead.convertedAt} />
                  </Property>
                </>
              ) : (
                <p className="text-fg-secondary text-sm leading-snug">
                  {conversionPreview(lead)}
                </p>
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
              content: (
                <div className="flex flex-col gap-6">
                  {lead.message && <LeadMessage message={lead.message} />}
                  <Timeline target={{ leadId: lead._id }} />
                </div>
              ),
            },
            {
              id: "details",
              label: "Details",
              content: (
                <div className="flex flex-col gap-8">
                  <RecordSection title="Contact">
                    <Properties>
                      <Property label="Name">
                        <InlineText
                          value={lead.name}
                          label="Name"
                          onSave={(name) => save({ name }, "Name")}
                        />
                      </Property>
                      <Property label="Company">
                        <InlineText
                          value={lead.companyName}
                          label="Company"
                          onSave={(companyName) =>
                            save({ companyName }, "Company")
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
                  </RecordSection>
                  <RecordSection title="Attribution">
                    <Properties>
                      {attribution.map(([label, value]) => (
                        <Property key={label} label={label}>
                          <span
                            title={value}
                            className={
                              label === "Landing page" || label === "Referrer"
                                ? "truncate font-mono text-xs"
                                : "truncate text-sm"
                            }
                          >
                            {value}
                          </span>
                        </Property>
                      ))}
                    </Properties>
                  </RecordSection>
                  <RecordSection title="Consent">
                    <LeadConsents consents={lead.consents} />
                  </RecordSection>
                </div>
              ),
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
        className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-8"
      >
        <div className="flex items-center gap-4 lg:col-span-2">
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
        <div className="flex flex-col gap-3 max-lg:order-first">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </Page>
  );
}
