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
import {
  vApproval,
  vPayment,
  vPolicy,
  vProposalLine,
  vProposalStatus,
} from "./lib/pricing";
import { vConsentEvent, vConsentPurpose, vLawfulBasis } from "./lib/consent";
import {
  vAutomationStatus,
  vEnrollmentStatus,
  vGraph,
  vHistoryEntry,
  vMessageChannel,
  vMessageStatus,
  vPublished,
  vSettings,
  vStats,
  vStepLevel,
  vSubjectKind,
  vTrigger,
} from "./lib/automations/validators";

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
    .index("by_phone", ["phone"])
    .index("by_person", ["personId"]),

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
    .index("by_assignee_status_completed", [
      "assigneeId",
      "status",
      "completedAt",
    ])
    .index("by_status_position", ["status", "position"])
    .index("by_status_completed", ["status", "completedAt"])
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
    .index("by_lead", ["leadId", "occurredAt"])
    .index("by_account_kind", ["accountId", "kind", "occurredAt"])
    .index("by_person_kind", ["personId", "kind", "occurredAt"]),

  notifications: defineTable({
    recipientId: v.id("members"),
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    readAt: v.optional(v.number()),
  })
    .index("by_recipient", ["recipientId", "readAt"])
    .index("by_recipient_time", ["recipientId"]),

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
    /** Envelope version; absent means 1. */
    v: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    /** Stored but deliberately not processed, e.g. a demo organisation. */
    ignored: v.optional(v.string()),
  })
    .index("by_event_id", ["eventId"])
    .index("by_org", ["orgId", "occurredAt"])
    .index("by_user_type", ["userId", "type"]),

  /** The latest read of an account's organisation from the platform admin API. */
  platformSnapshots: defineTable({
    accountId: v.id("accounts"),
    orgId: v.string(),
    source: v.union(v.literal("live"), v.literal("sandbox")),
    fetchedAt: v.number(),
    /** The latest sync failed; the data is from `fetchedAt`. */
    error: v.optional(v.string()),
    attemptedAt: v.optional(v.number()),
    balancePaise: v.optional(v.number()),
    heldPaise: v.optional(v.number()),
    creditLimitPaise: v.optional(v.number()),
    paymentMode: v.optional(v.string()),
    campaigns: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        status: v.string(),
        pauseReason: v.optional(v.string()),
        enrolled: v.number(),
        max: v.optional(v.number()),
        pending: v.number(),
        approved: v.number(),
        submittedAt: v.optional(v.number()),
        endDate: v.optional(v.string()),
      }),
    ),
    deposits30d: v.number(),
    deposits90d: v.number(),
    depositCount90d: v.number(),
    staleReviews: v.number(),
    oldestReviewDays: v.optional(v.number()),
    disputes: v.number(),
    listings: v.array(
      v.object({
        marketplace: v.string(),
        count: v.number(),
        firstAt: v.number(),
        latestAt: v.number(),
      }),
    ),
    members: v.array(
      v.object({
        userId: v.string(),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        roles: v.array(v.string()),
      }),
    ),
  })
    .index("by_account", ["accountId"])
    .index("by_org", ["orgId"]),

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
    payment: v.optional(vPayment),
    /** The pricing policy a sent version was priced under. */
    policy: v.optional(vPolicy),
    approval: v.optional(vApproval),
    createdById: v.id("members"),
    sentAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_deal", ["dealId", "version"]),

  /** A trigger and a graph of steps; the engine runs the `published` snapshot. */
  automations: defineTable({
    name: v.string(),
    description: v.string(),
    status: vAutomationStatus,
    subjectKind: vSubjectKind,
    trigger: vTrigger,
    graph: vGraph,
    settings: vSettings,
    /** Bumped on every activation that publishes a change. */
    version: v.number(),
    published: v.optional(vPublished),
    stats: vStats,
    templateKey: v.optional(v.string()),
    createdById: v.id("members"),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),

  /** One record's run through an automation. */
  automationEnrollments: defineTable({
    automationId: v.id("automations"),
    version: v.number(),
    subjectKind: vSubjectKind,
    /** `<kind>:<id>`, to find a record's runs and keep one live run per automation. */
    subjectKey: v.string(),
    leadId: v.optional(v.id("leads")),
    personId: v.optional(v.id("people")),
    accountId: v.optional(v.id("accounts")),
    dealId: v.optional(v.id("deals")),
    status: vEnrollmentStatus,
    currentNodeId: v.string(),
    /** The only scheduled step allowed to run; anything else is stale. */
    stepKey: v.string(),
    seq: v.number(),
    attempt: v.number(),
    nextRunAt: v.optional(v.number()),
    /** Set while the current step is a wait that has started. */
    waitStartedAt: v.optional(v.number()),
    waitingFor: v.optional(vTrigger),
    /** Held because the automation is paused; resumes on activation. */
    heldAt: v.optional(v.number()),
    enrolledAt: v.number(),
    enrolledById: v.optional(v.id("members")),
    source: v.string(),
    finishedAt: v.optional(v.number()),
    exitReason: v.optional(v.string()),
    history: v.array(vHistoryEntry),
  })
    .index("by_automation", ["automationId", "status"])
    .index("by_automation_subject", ["automationId", "subjectKey"])
    .index("by_subject", ["subjectKey", "status"])
    .index("by_status", ["status"]),

  /** Run log: one row per thing a step did or decided. */
  automationSteps: defineTable({
    automationId: v.id("automations"),
    enrollmentId: v.id("automationEnrollments"),
    nodeId: v.optional(v.string()),
    stepKey: v.optional(v.string()),
    at: v.number(),
    level: vStepLevel,
    message: v.string(),
  })
    .index("by_enrollment", ["enrollmentId", "at"])
    .index("by_automation", ["automationId", "at"])
    .index("by_automation_node", ["automationId", "nodeId", "at"])
    .index("by_step_key", ["stepKey"]),

  /** Outbound email and WhatsApp messages; at most one per step key. */
  automationMessages: defineTable({
    automationId: v.id("automations"),
    enrollmentId: v.id("automationEnrollments"),
    stepKey: v.string(),
    channel: vMessageChannel,
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    to: v.string(),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    template: v.optional(v.string()),
    language: v.optional(v.string()),
    params: v.optional(v.array(v.string())),
    status: vMessageStatus,
    /** "outbox" when no provider is configured: recorded, never sent. */
    provider: v.string(),
    providerMessageId: v.optional(v.string()),
    attempts: v.number(),
    error: v.optional(v.string()),
    timelineId: v.optional(v.id("timeline")),
    sentAt: v.optional(v.number()),
  })
    .index("by_step_key", ["stepKey"])
    .index("by_enrollment", ["enrollmentId"])
    .index("by_status", ["status"]),
});
