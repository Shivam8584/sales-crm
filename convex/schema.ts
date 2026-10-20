import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const companyFields = {
  slug: v.string(),
  name: v.string(),
  tags: v.array(v.string()),
  owner: v.string(),
  openDeals: v.number(),
  pipelineValue: v.number(),
  winProbability: v.number(),
  trend: v.array(v.number()),
  lastInteraction: v.object({ date: v.string(), label: v.string() }),
  activityDays: v.number(),
  domain: v.optional(v.string()),
  logo: v.optional(v.string()),
  gstin: v.optional(v.string()),
};

export const dealFields = {
  title: v.string(),
  companySlug: v.string(),
  stage: v.string(),
  value: v.number(),
  owner: v.string(),
  closeDate: v.union(v.string(), v.null()),
  rank: v.number(),
  createdAt: v.string(),
  contactIds: v.optional(v.array(v.id("contacts"))),
};

export const taskFields = {
  title: v.string(),
  description: v.string(),
  status: v.string(),
  priority: v.string(),
  assignee: v.string(),
  companySlug: v.union(v.string(), v.null()),
  dueDate: v.union(v.string(), v.null()),
  rank: v.number(),
  createdAt: v.string(),
  contactId: v.optional(v.union(v.id("contacts"), v.null())),
  dealId: v.optional(v.union(v.id("deals"), v.null())),
};

export const contactFields = {
  companySlug: v.union(v.string(), v.null()),
  firstName: v.string(),
  lastName: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  title: v.union(v.string(), v.null()),
  linkedin: v.union(v.string(), v.null()),
  owner: v.string(),
  tags: v.array(v.string()),
  createdAt: v.string(),
};

export const leadFields = {
  name: v.string(),
  email: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  companyName: v.string(),
  website: v.union(v.string(), v.null()),
  gstin: v.union(v.string(), v.null()),
  source: v.string(),
  status: v.string(),
  message: v.string(),
  owner: v.union(v.string(), v.null()),
  utm: v.optional(
    v.object({
      source: v.optional(v.string()),
      medium: v.optional(v.string()),
      campaign: v.optional(v.string()),
    }),
  ),
  createdAt: v.string(),
  convertedAt: v.union(v.string(), v.null()),
  convertedCompanySlug: v.union(v.string(), v.null()),
  convertedContactId: v.union(v.id("contacts"), v.null()),
  convertedDealId: v.union(v.id("deals"), v.null()),
};

export const activityFields = {
  kind: v.string(),
  subject: v.string(),
  body: v.string(),
  at: v.string(),
  durationMin: v.union(v.number(), v.null()),
  outcome: v.union(v.string(), v.null()),
  companySlug: v.union(v.string(), v.null()),
  contactId: v.union(v.id("contacts"), v.null()),
  dealId: v.union(v.id("deals"), v.null()),
  author: v.string(),
  authorId: v.union(v.id("users"), v.null()),
  createdAt: v.string(),
};

export const memberFields = {
  userId: v.id("users"),
  role: v.string(),
  name: v.string(),
  email: v.string(),
  active: v.boolean(),
  joinedAt: v.string(),
};

export const inviteFields = {
  email: v.string(),
  role: v.string(),
  token: v.string(),
  invitedBy: v.string(),
  createdAt: v.string(),
  expiresAt: v.string(),
  acceptedAt: v.union(v.string(), v.null()),
  revokedAt: v.union(v.string(), v.null()),
};

export const factFields = {
  subjectType: v.string(),
  subjectId: v.string(),
  field: v.string(),
  value: v.string(),
  source: v.string(),
  evidence: v.string(),
  observedAt: v.string(),
  status: v.string(),
  decidedBy: v.union(v.string(), v.null()),
};

export const enrichmentRunFields = {
  subjectType: v.string(),
  subjectId: v.string(),
  provider: v.string(),
  status: v.string(),
  error: v.union(v.string(), v.null()),
  requestedBy: v.string(),
  startedAt: v.string(),
  finishedAt: v.union(v.string(), v.null()),
};

export default defineSchema({
  ...authTables,
  companies: defineTable({ ...companyFields, position: v.number() })
    .index("by_slug", ["slug"])
    .index("by_position", ["position"]),
  notes: defineTable({
    companySlug: v.string(),
    body: v.string(),
    author: v.string(),
    authorId: v.optional(v.id("users")),
    at: v.string(),
  }).index("by_company", ["companySlug"]),
  deals: defineTable(dealFields).index("by_company", ["companySlug"]),
  tasks: defineTable(taskFields).index("by_company", ["companySlug"]),
  contacts: defineTable(contactFields)
    .index("by_company", ["companySlug"])
    .index("by_email", ["email"]),
  leads: defineTable(leadFields)
    .index("by_status", ["status"])
    .index("by_email", ["email"]),
  activities: defineTable(activityFields)
    .index("by_company", ["companySlug"])
    .index("by_contact", ["contactId"])
    .index("by_deal", ["dealId"]),
  members: defineTable(memberFields)
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),
  invites: defineTable(inviteFields)
    .index("by_email", ["email"])
    .index("by_token", ["token"]),
  facts: defineTable(factFields).index("by_subject", [
    "subjectType",
    "subjectId",
  ]),
  enrichmentRuns: defineTable(enrichmentRunFields).index("by_subject", [
    "subjectType",
    "subjectId",
  ]),
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
  meta: defineTable({ key: v.string() }).index("by_key", ["key"]),
  changes: defineTable({
    companySlug: v.string(),
    text: v.string(),
    author: v.string(),
    at: v.string(),
  }).index("by_company", ["companySlug"]),
});
