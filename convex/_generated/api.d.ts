/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account360 from "../account360.js";
import type * as accounts from "../accounts.js";
import type * as activation from "../activation.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as automations from "../automations.js";
import type * as consents from "../consents.js";
import type * as counts from "../counts.js";
import type * as crons from "../crons.js";
import type * as deals from "../deals.js";
import type * as enrichment from "../enrichment.js";
import type * as exports from "../exports.js";
import type * as follows from "../follows.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as invites from "../invites.js";
import type * as leads from "../leads.js";
import type * as lib_activation from "../lib/activation.js";
import type * as lib_assignment from "../lib/assignment.js";
import type * as lib_automations_delivery from "../lib/automations/delivery.js";
import type * as lib_automations_engine from "../lib/automations/engine.js";
import type * as lib_automations_safety from "../lib/automations/safety.js";
import type * as lib_automations_subject from "../lib/automations/subject.js";
import type * as lib_automations_templates from "../lib/automations/templates.js";
import type * as lib_automations_validators from "../lib/automations/validators.js";
import type * as lib_consent from "../lib/consent.js";
import type * as lib_counts from "../lib/counts.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_deals from "../lib/deals.js";
import type * as lib_demo from "../lib/demo.js";
import type * as lib_enrichment from "../lib/enrichment.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_follows from "../lib/follows.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_leads from "../lib/leads.js";
import type * as lib_lists from "../lib/lists.js";
import type * as lib_mentions from "../lib/mentions.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_ownership from "../lib/ownership.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_platform from "../lib/platform.js";
import type * as lib_platformClient from "../lib/platformClient.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_reports from "../lib/reports.js";
import type * as lib_scraper from "../lib/scraper.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_tasks from "../lib/tasks.js";
import type * as lib_timeline from "../lib/timeline.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as people from "../people.js";
import type * as platform from "../platform.js";
import type * as platformSync from "../platformSync.js";
import type * as proposals from "../proposals.js";
import type * as prospecting from "../prospecting.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as shell from "../shell.js";
import type * as smtp from "../smtp.js";
import type * as tasks from "../tasks.js";
import type * as timeline from "../timeline.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account360: typeof account360;
  accounts: typeof accounts;
  activation: typeof activation;
  alerts: typeof alerts;
  auth: typeof auth;
  automations: typeof automations;
  consents: typeof consents;
  counts: typeof counts;
  crons: typeof crons;
  deals: typeof deals;
  enrichment: typeof enrichment;
  exports: typeof exports;
  follows: typeof follows;
  http: typeof http;
  inbound: typeof inbound;
  invites: typeof invites;
  leads: typeof leads;
  "lib/activation": typeof lib_activation;
  "lib/assignment": typeof lib_assignment;
  "lib/automations/delivery": typeof lib_automations_delivery;
  "lib/automations/engine": typeof lib_automations_engine;
  "lib/automations/safety": typeof lib_automations_safety;
  "lib/automations/subject": typeof lib_automations_subject;
  "lib/automations/templates": typeof lib_automations_templates;
  "lib/automations/validators": typeof lib_automations_validators;
  "lib/consent": typeof lib_consent;
  "lib/counts": typeof lib_counts;
  "lib/crypto": typeof lib_crypto;
  "lib/deals": typeof lib_deals;
  "lib/demo": typeof lib_demo;
  "lib/enrichment": typeof lib_enrichment;
  "lib/errors": typeof lib_errors;
  "lib/follows": typeof lib_follows;
  "lib/functions": typeof lib_functions;
  "lib/http": typeof lib_http;
  "lib/identity": typeof lib_identity;
  "lib/leads": typeof lib_leads;
  "lib/lists": typeof lib_lists;
  "lib/mentions": typeof lib_mentions;
  "lib/money": typeof lib_money;
  "lib/ownership": typeof lib_ownership;
  "lib/permissions": typeof lib_permissions;
  "lib/platform": typeof lib_platform;
  "lib/platformClient": typeof lib_platformClient;
  "lib/pricing": typeof lib_pricing;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/records": typeof lib_records;
  "lib/reports": typeof lib_reports;
  "lib/scraper": typeof lib_scraper;
  "lib/settings": typeof lib_settings;
  "lib/tasks": typeof lib_tasks;
  "lib/timeline": typeof lib_timeline;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  migrations: typeof migrations;
  notifications: typeof notifications;
  people: typeof people;
  platform: typeof platform;
  platformSync: typeof platformSync;
  proposals: typeof proposals;
  prospecting: typeof prospecting;
  reports: typeof reports;
  seed: typeof seed;
  settings: typeof settings;
  shell: typeof shell;
  smtp: typeof smtp;
  tasks: typeof tasks;
  timeline: typeof timeline;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  accountCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"accountCounts">;
  peopleCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"peopleCounts">;
  leadCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"leadCounts">;
};
