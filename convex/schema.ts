import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
} from "../lib/domain/custom-fields";
import { PLAYBOOK_KINDS } from "../lib/domain/playbook";
import {
  literals,
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
import { vAttempt } from "./lib/enrichment/validators";
import {
  vAutomationStatus,
  vEnrollmentStatus,
  vExitKind,
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

const vCustomFieldEntity = literals(CUSTOM_FIELD_ENTITIES);
const vCustomFieldType = literals(CUSTOM_FIELD_TYPES);
const vCustom = v.optional(
  v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
);

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
    /** Set when the member finishes or skips the first-run tour. */
    tourCompletedAt: v.optional(v.number()),
    digestOff: v.optional(v.boolean()),
    /** E.164; the number click-to-call rings first. */
    phone: v.optional(v.string()),
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
    custom: vCustom,
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
    .index("list_activity", ["archivedAt", "lastActivityAt"])
    .index("list_name", ["archivedAt", "name"])
    .index("list_owner_activity", ["ownerId", "archivedAt", "lastActivityAt"])
    .index("list_owner_name", ["ownerId", "archivedAt", "name"])
    .index("list_stage_activity", ["stage", "archivedAt", "lastActivityAt"])
    .index("list_stage_name", ["stage", "archivedAt", "name"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["ownerId", "stage", "archivedAt"],
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
    custom: vCustom,
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
    .index("list_activity", ["archivedAt", "lastActivityAt"])
    .index("list_name", ["archivedAt", "firstName", "lastName"])
    .index("list_owner_activity", ["ownerId", "archivedAt", "lastActivityAt"])
    .index("list_owner_name", [
      "ownerId",
      "archivedAt",
      "firstName",
      "lastName",
    ])
    .index("list_account_activity", [
      "accountId",
      "archivedAt",
      "lastActivityAt",
    ])
    .index("list_account_name", [
      "accountId",
      "archivedAt",
      "firstName",
      "lastName",
    ])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["accountId", "ownerId", "archivedAt"],
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
    score: v.optional(v.number()),
    scoreReasons: v.optional(v.array(v.string())),
    /** Form submissions folded into this lead after the first. */
    repeats: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"])
    .index("by_person", ["personId"])
    .index("by_account", ["accountId"])
    .index("list_touched", ["status", "firstTouchedAt"])
    .index("list_demo", ["status", "demoAt"])
    .index("list_name", ["status", "name"])
    .index("list_owner_touched", ["ownerId", "status", "firstTouchedAt"])
    .index("list_owner_demo", ["ownerId", "status", "demoAt"])
    .index("list_owner_name", ["ownerId", "status", "name"])
    .index("list_score", ["status", "score"])
    .index("list_owner_score", ["ownerId", "status", "score"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["status", "ownerId"],
    })
    .searchIndex("search_company", {
      searchField: "companyName",
      filterFields: ["status", "ownerId"],
    }),

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
    .index("by_lead", ["leadId"])
    .index("by_event", ["event"]),

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
    custom: vCustom,
    updatedAt: v.number(),
  })
    .index("by_account", ["accountId"])
    .index("by_stage_position", ["stage", "position"])
    .index("by_stage_closed", ["stage", "closedAt"])
    .index("by_owner", ["ownerId"])
    .index("list_close", ["closeDate"])
    .index("list_amount", ["amount.amount"])
    .index("list_title", ["title"])
    .index("list_owner_close", ["ownerId", "closeDate"])
    .index("list_owner_amount", ["ownerId", "amount.amount"])
    .index("list_owner_title", ["ownerId", "title"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId", "accountId"],
    }),

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
    /** Who last changed the assignee, and when: lets them undo a hand-off. */
    reassignedById: v.optional(v.id("members")),
    reassignedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_assignee_status_completed", [
      "assigneeId",
      "status",
      "completedAt",
    ])
    .index("by_assignee_status_due", ["assigneeId", "status", "dueDate"])
    .index("by_status_due", ["status", "dueDate"])
    .index("by_status_position", ["status", "position"])
    .index("by_status_completed", ["status", "completedAt"])
    .index("by_account", ["accountId"])
    .index("by_person", ["personId"])
    .index("by_deal", ["dealId"])
    .index("by_lead", ["leadId"])
    .index("by_automation_key", ["automationKey"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["assigneeId", "status"],
    }),

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
    /** Members @mentioned in the body, which holds them as `<@id>` tokens. */
    mentions: v.optional(v.array(v.id("members"))),
    /** Written by an automation, not a teammate: never counts as an interaction. */
    automated: v.optional(v.boolean()),
    /** For emails and WhatsApp: "inbound" is a reply received from the contact. */
    direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
  })
    .index("by_account", ["accountId", "occurredAt"])
    .index("by_person", ["personId", "occurredAt"])
    .index("by_deal", ["dealId", "occurredAt"])
    .index("by_lead", ["leadId", "occurredAt"])
    .index("by_account_kind", ["accountId", "kind", "occurredAt"])
    .index("by_person_kind", ["personId", "kind", "occurredAt"])
    .index("by_kind", ["kind", "occurredAt"]),

  notifications: defineTable({
    recipientId: v.id("members"),
    kind: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    href: v.optional(v.string()),
    readAt: v.optional(v.number()),
    /** `accounts:<id>`, the record it is about; grouping and follow batching key. */
    record: v.optional(v.string()),
    actorId: v.optional(v.id("members")),
    entryId: v.optional(v.id("timeline")),
    /** Follow updates merged into this one. */
    count: v.optional(v.number()),
    /** Cleared from the inbox; archived implies read. */
    archivedAt: v.optional(v.number()),
  })
    .index("by_recipient", ["recipientId", "readAt"])
    .index("by_recipient_time", ["recipientId"])
    .index("by_recipient_archived", ["recipientId", "archivedAt"])
    .index("by_recipient_record", ["recipientId", "record"])
    .index("by_record_kind", ["record", "kind"]),

  /** A member following a record hears about its stage changes, deals and notes. */
  follows: defineTable({
    memberId: v.id("members"),
    record: v.string(),
  })
    .index("by_record", ["record"])
    .index("by_member_record", ["memberId", "record"]),

  /** A browser or phone a member allowed push notifications on. */
  pushSubscriptions: defineTable({
    memberId: v.id("members"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  })
    .index("by_member", ["memberId"])
    .index("by_endpoint", ["endpoint"]),

  /** A member's own named filter set for a list page. */
  savedViews: defineTable({
    memberId: v.id("members"),
    path: v.string(),
    name: v.string(),
    query: v.string(),
  }).index("by_member_path", ["memberId", "path"]),

  /** The last model answer per account brief or member's Today list; `hash` is of the context it was written from. */
  aiCache: defineTable({
    kind: v.union(v.literal("brief"), v.literal("next")),
    key: v.string(),
    hash: v.string(),
    data: v.any(),
    at: v.number(),
  }).index("by_kind_key", ["kind", "key"]),

  /** A record a member keeps in the sidebar. */
  pins: defineTable({
    memberId: v.id("members"),
    record: v.string(),
  })
    .index("by_member", ["memberId"])
    .index("by_member_record", ["memberId", "record"]),

  /** Admin-defined fields; values live in `custom` on the record, by `key`. */
  customFields: defineTable({
    entity: vCustomFieldEntity,
    key: v.string(),
    label: v.string(),
    type: vCustomFieldType,
    options: v.optional(v.array(v.string())),
    order: v.number(),
  })
    .index("by_entity", ["entity", "order"])
    .index("by_entity_key", ["entity", "key"]),

  attachments: defineTable({
    accountId: v.optional(v.id("accounts")),
    personId: v.optional(v.id("people")),
    dealId: v.optional(v.id("deals")),
    leadId: v.optional(v.id("leads")),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    contentType: v.string(),
    uploadedById: v.id("members"),
  })
    .index("by_account", ["accountId"])
    .index("by_person", ["personId"])
    .index("by_deal", ["dealId"])
    .index("by_lead", ["leadId"])
    .index("by_storage", ["storageId"]),

  /** Objection answers, battlecards, case studies and demo scripts reps copy into messages. */
  playbook: defineTable({
    kind: literals(PLAYBOOK_KINDS),
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
    /** `title` and `body` joined, since a search index covers one field. */
    searchText: v.string(),
    updatedAt: v.number(),
    updatedById: v.id("members"),
  })
    .index("by_kind_title", ["kind", "title"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["kind"],
    }),

  /** Calls placed through the telephony provider, so its status callback can be matched and logged once. */
  phoneCalls: defineTable({
    sid: v.string(),
    memberId: v.id("members"),
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    startedAt: v.number(),
    loggedAt: v.optional(v.number()),
  }).index("by_sid", ["sid"]),

  /**
   * When an org first reached each activation stage, or a user signed up
   * (`signed_up`), kept in step with `platformEvents` by a trigger so reports
   * don't scan events. `creator` is the user who created the org.
   */
  activationStages: defineTable({
    orgId: v.optional(v.string()),
    userId: v.optional(v.string()),
    stages: v.object({
      signed_up: v.optional(v.number()),
      org_created: v.optional(v.number()),
      funded: v.optional(v.number()),
      live: v.optional(v.number()),
      activated: v.optional(v.number()),
    }),
    creator: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

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
    /** 0 to 1; absent on facts recorded before provider chains. */
    confidence: v.optional(v.number()),
    url: v.optional(v.string()),
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
    attempts: v.optional(v.array(vAttempt)),
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

  /** An admin chose to keep a stale prospect; hides it from retention review for one window. */
  retentionReviews: defineTable({
    personId: v.optional(v.id("people")),
    leadId: v.optional(v.id("leads")),
    keptById: v.id("members"),
    keptAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_lead", ["leadId"]),

  /** The deal-desk proposal for a deal, one per deal. */
  proposals: defineTable({
    dealId: v.id("deals"),
    status: vProposalStatus,
    currency: vCurrency,
    lines: v.array(vProposalLine),
    validUntil: vDay,
    terms: v.string(),
    payment: v.optional(vPayment),
    /** The pricing policy a sent proposal was priced under. */
    policy: v.optional(vPolicy),
    approval: v.optional(vApproval),
    createdById: v.id("members"),
    sentAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_deal", ["dealId"]),

  /** Marketplace listings watched for their review gap against category leaders. */
  watchlists: defineTable({
    name: v.string(),
    /** Ratings a listing should reach; absent means its category's leaders set it. */
    benchmark: v.optional(v.number()),
    createdById: v.id("members"),
    refreshedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }),

  watchedProducts: defineTable({
    watchlistId: v.id("watchlists"),
    marketplace: v.string(),
    identifier: v.string(),
    /** `marketplace:identifier`, lower-cased; one per watchlist. */
    listingKey: v.string(),
    url: v.string(),
    status: v.union(v.literal("pending"), v.literal("ok"), v.literal("failed")),
    error: v.optional(v.string()),
    source: v.optional(v.union(v.literal("live"), v.literal("sandbox"))),
    title: v.optional(v.string()),
    brand: v.optional(v.string()),
    brandKey: v.optional(v.string()),
    category: v.optional(v.string()),
    price: v.optional(vMoney),
    mrp: v.optional(vMoney),
    rating: v.optional(v.number()),
    ratingsCount: v.optional(v.number()),
    /** Ratings a week over the last 28 days, from snapshots. */
    velocity: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    variants: v.optional(v.number()),
    queuedAt: v.optional(v.number()),
    checkedAt: v.optional(v.number()),
    addedById: v.id("members"),
    removedAt: v.optional(v.number()),
  })
    .index("by_watchlist", ["watchlistId"])
    .index("by_watchlist_listing", ["watchlistId", "listingKey"])
    .index("by_brand", ["brandKey"]),

  /** One reading of a watched listing per calendar day. */
  productSnapshots: defineTable({
    productId: v.id("watchedProducts"),
    day: vDay,
    takenAt: v.number(),
    rating: v.optional(v.number()),
    ratingsCount: v.optional(v.number()),
    price: v.optional(vMoney),
  }).index("by_product_day", ["productId", "day"]),

  /** What the team decided about a brand found by prospecting. */
  prospectBrands: defineTable({
    brandKey: v.string(),
    brand: v.string(),
    /** Set by hand; overrides matching by name or domain. */
    accountId: v.optional(v.id("accounts")),
    leadId: v.optional(v.id("leads")),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandKey"])
    .index("by_account", ["accountId"]),

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
    exitKind: v.optional(vExitKind),
    /** A reply arrived while the run was live or soon after it ended. */
    repliedAt: v.optional(v.number()),
    /** Paused by hand; unlike `heldAt`, re-activating the automation doesn't resume it. */
    pausedById: v.optional(v.id("members")),
    /** Values for `{{prospect.*}}` given at enrolment. */
    context: v.optional(v.record(v.string(), v.string())),
    history: v.array(vHistoryEntry),
  })
    .index("by_automation", ["automationId", "status"])
    .index("by_automation_time", ["automationId"])
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
    .index("by_status", ["status"])
    .index("by_automation", ["automationId", "status"])
    .index("by_person", ["personId"])
    .index("by_lead", ["leadId"]),
});
