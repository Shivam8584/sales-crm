import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  vCallOutcome,
  vChannel,
  vCurrency,
  vDay,
  vDealStage,
  vDisqualifyReason,
  vFactStatus,
  vLeadKind,
  vRunStatus,
  vLeadStatus,
  vLifecycleStage,
  vMemberStatus,
  vMoney,
  vPriority,
  vRole,
  vTaskStatus,
  vTimelineKind,
  vUtm,
} from "./lib/validators";
import { vApproval, vProposalLine, vProposalStatus } from "./lib/pricing";
import { vConsentEvent, vConsentPurpose, vLawfulBasis } from "./lib/consent";

/**
 * Times are epoch milliseconds; calendar days are `YYYY-MM-DD` strings.
 * Records reference each other by Convex id, and people by `members` id,
 * never by display name.
 */
export default defineSchema({
  ...authTables,

  members: defineTable({
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
    role: vRole,
    status: vMemberStatus,
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  invites: defineTable({
    email: v.string(),
    role: vRole,
    tokenHash: v.string(),
    invitedById: v.id("members"),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_token_hash", ["tokenHash"]),

  accounts: defineTable({
    name: v.string(),
    domain: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    ownerId: v.id("members"),
    stage: vLifecycleStage,
    tags: v.array(v.string()),
    gstin: v.optional(v.string()),
    panRoot: v.optional(v.string()),
    platformOrgId: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_stage", ["stage"])
    .index("by_domain", ["domain"])
    .index("by_pan_root", ["panRoot"])
    .index("by_platform_org", ["platformOrgId"])
    .index("by_updated", ["updatedAt"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["ownerId", "stage"],
    }),

  people: defineTable({
    accountId: v.optional(v.id("accounts")),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    ownerId: v.id("members"),
    tags: v.array(v.string()),
    platformUserId: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    erasedAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    updatedAt: v.number(),
    searchText: v.string(),
  })
    .index("by_account", ["accountId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_owner", ["ownerId"])
    .index("by_platform_user", ["platformUserId"])
    .index("by_updated", ["updatedAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["accountId", "ownerId"],
    }),

  leads: defineTable({
    kind: vLeadKind,
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    companyName: v.string(),
    website: v.optional(v.string()),
    gstin: v.optional(v.string()),
    message: v.optional(v.string()),
    source: v.string(),
    utm: vUtm,
    referrer: v.optional(v.string()),
    landingPage: v.optional(v.string()),
    status: vLeadStatus,
    disqualifyReason: v.optional(vDisqualifyReason),
    ownerId: v.optional(v.id("members")),
    assignedAt: v.optional(v.number()),
    firstTouchedAt: v.optional(v.number()),
    slaBreachedAt: v.optional(v.number()),
    demoAt: v.optional(v.number()),
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    convertedAt: v.optional(v.number()),
    erasedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"]),

  consents: defineTable({
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    channel: vChannel,
    granted: v.boolean(),
    text: v.string(),
    source: v.string(),
    ip: v.optional(v.string()),
    recordedAt: v.number(),
    /** Absent on rows from before the ledger: `granted` then means grant or withdraw. */
    event: v.optional(vConsentEvent),
    basis: v.optional(vLawfulBasis),
    /** Absent on a withdrawal or DND means every purpose. */
    purpose: v.optional(vConsentPurpose),
    actorId: v.optional(v.id("members")),
    redactedAt: v.optional(v.number()),
  })
    .index("by_person", ["personId"])
    .index("by_lead", ["leadId"]),

  deals: defineTable({
    accountId: v.id("accounts"),
    title: v.string(),
    stage: vDealStage,
    amount: vMoney,
    ownerId: v.id("members"),
    closeDate: v.optional(vDay),
    personIds: v.array(v.id("people")),
    position: v.number(),
    lostReason: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_stage_position", ["stage", "position"])
    .index("by_owner", ["ownerId"]),

  tasks: defineTable({
    title: v.string(),
    notes: v.optional(v.string()),
    status: vTaskStatus,
    priority: vPriority,
    assigneeId: v.id("members"),
    dueDate: v.optional(vDay),
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    dealId: v.optional(v.id("deals")),
    leadId: v.optional(v.id("leads")),
    position: v.number(),
    automationKey: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_assignee_status", ["assigneeId", "status"])
    .index("by_status_position", ["status", "position"])
    .index("by_account", ["accountId"])
    .index("by_person", ["personId"])
    .index("by_deal", ["dealId"])
    .index("by_lead", ["leadId"])
    .index("by_automation_key", ["automationKey"]),

  /** Every interaction and change on a record, shown as one timeline. */
  timeline: defineTable({
    kind: vTimelineKind,
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    dealId: v.optional(v.id("deals")),
    leadId: v.optional(v.id("leads")),
    actorId: v.optional(v.id("members")),
    occurredAt: v.number(),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    durationMin: v.optional(v.number()),
    outcome: v.optional(vCallOutcome),
    changes: v.optional(
      v.array(
        v.object({
          field: v.string(),
          from: v.optional(v.string()),
          to: v.optional(v.string()),
        }),
      ),
    ),
    editedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId", "occurredAt"])
    .index("by_person", ["personId", "occurredAt"])
    .index("by_deal", ["dealId", "occurredAt"])
    .index("by_lead", ["leadId", "occurredAt"]),

  notifications: defineTable({
    recipientId: v.id("members"),
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    readAt: v.optional(v.number()),
  }).index("by_recipient", ["recipientId", "readAt"]),

  /** Evidence-backed field values from enrichment providers. */
  facts: defineTable({
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    field: v.string(),
    value: v.string(),
    source: v.string(),
    evidence: v.string(),
    observedAt: v.number(),
    status: vFactStatus,
    decidedById: v.optional(v.id("members")),
  })
    .index("by_account", ["accountId"])
    .index("by_person", ["personId"])
    .index("by_lead", ["leadId"]),

  enrichmentRuns: defineTable({
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    provider: v.string(),
    status: vRunStatus,
    error: v.optional(v.string()),
    requestedById: v.id("members"),
    finishedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_person", ["personId"])
    .index("by_lead", ["leadId"]),

  /** Raw events received from the Hypedrive platform, deduplicated by eventId. */
  platformEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    orgId: v.optional(v.string()),
    userId: v.optional(v.string()),
    occurredAt: v.number(),
    payload: v.string(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_event_id", ["eventId"])
    .index("by_org", ["orgId", "occurredAt"])
    .index("by_user_type", ["userId", "type"]),

  settings: defineTable({ key: v.string(), value: v.string() }).index(
    "by_key",
    ["key"],
  ),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  /** An admin chose to keep a stale prospect; hides it from retention review for one window. */
  retentionReviews: defineTable({
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    keptById: v.id("members"),
    keptAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_lead", ["leadId"]),

  /** Deal-desk pricing for a deal; each version is frozen once it is sent. */
  proposals: defineTable({
    dealId: v.id("deals"),
    version: v.number(),
    status: vProposalStatus,
    currency: vCurrency,
    lines: v.array(vProposalLine),
    validUntil: vDay,
    terms: v.string(),
    approval: v.optional(vApproval),
    createdById: v.id("members"),
    sentAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_deal", ["dealId", "version"]),
});
