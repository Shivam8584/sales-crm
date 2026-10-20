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
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_records from "../lib/records.js";
import type * as lib_timeline from "../lib/timeline.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as people from "../people.js";
import type * as seed from "../seed.js";
import type * as timeline from "../timeline.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  http: typeof http;
  "lib/crypto": typeof lib_crypto;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/money": typeof lib_money;
  "lib/records": typeof lib_records;
  "lib/timeline": typeof lib_timeline;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  people: typeof people;
  seed: typeof seed;
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
