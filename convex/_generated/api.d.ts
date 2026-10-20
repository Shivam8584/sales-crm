/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as activation from "../activation.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as deals from "../deals.js";
import type * as enrichment from "../enrichment.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as leads from "../leads.js";
import type * as lib_activation from "../lib/activation.js";
import type * as lib_assignment from "../lib/assignment.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_enrichment from "../lib/enrichment.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_leads from "../lib/leads.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_platform from "../lib/platform.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_reports from "../lib/reports.js";
import type * as lib_tasks from "../lib/tasks.js";
import type * as lib_timeline from "../lib/timeline.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as notifications from "../notifications.js";
import type * as people from "../people.js";
import type * as platform from "../platform.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as timeline from "../timeline.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  activation: typeof activation;
  alerts: typeof alerts;
  auth: typeof auth;
  crons: typeof crons;
  deals: typeof deals;
  enrichment: typeof enrichment;
  http: typeof http;
  invites: typeof invites;
  leads: typeof leads;
  "lib/activation": typeof lib_activation;
  "lib/assignment": typeof lib_assignment;
  "lib/crypto": typeof lib_crypto;
  "lib/enrichment": typeof lib_enrichment;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/http": typeof lib_http;
  "lib/leads": typeof lib_leads;
  "lib/money": typeof lib_money;
  "lib/platform": typeof lib_platform;
  "lib/records": typeof lib_records;
  "lib/reports": typeof lib_reports;
  "lib/tasks": typeof lib_tasks;
  "lib/timeline": typeof lib_timeline;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  notifications: typeof notifications;
  people: typeof people;
  platform: typeof platform;
  reports: typeof reports;
  seed: typeof seed;
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

export declare const components: {};
