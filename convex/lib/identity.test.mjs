import assert from "node:assert/strict";
import { test } from "node:test";
import { findAccount, findPerson } from "./identity.ts";

/** Just enough of `ctx.db` for equality lookups on an index. */
function fakeCtx(tables) {
  return {
    db: {
      query: (table) => ({
        withIndex: (_name, range) => {
          const filters = [];
          const q = {
            eq: (field, value) => {
              filters.push([field, value]);
              return q;
            },
          };
          range(q);
          return {
            collect: async () =>
              (tables[table] ?? []).filter((row) =>
                filters.every(([field, value]) => row[field] === value),
              ),
          };
        },
      }),
    },
  };
}

const accounts = [
  { _id: "archived", domain: "brand.in", archivedAt: 1 },
  { _id: "byDomain", domain: "brand.in" },
  { _id: "byPan", panRoot: "AAACB1234C", platformOrgId: "org_other" },
  { _id: "byOrg", platformOrgId: "org_1" },
];

test("accounts match by platform org, then PAN, then company domain", async () => {
  const ctx = fakeCtx({ accounts });
  assert.equal(
    (await findAccount(ctx, { platformOrgId: "org_1", domain: "brand.in" }))
      ?._id,
    "byOrg",
  );
  assert.equal(
    (await findAccount(ctx, { gstin: "27AAACB1234C1Z5", domain: "brand.in" }))
      ?._id,
    "byPan",
  );
  assert.equal(
    (await findAccount(ctx, { domain: "https://www.Brand.in/shop" }))?._id,
    "byDomain",
  );
});

test("shared email hosts and archived accounts never match", async () => {
  const ctx = fakeCtx({
    accounts: [...accounts, { _id: "gmail", domain: "gmail.com" }],
  });
  assert.equal(await findAccount(ctx, { domain: "gmail.com" }), null);
  assert.equal(
    await findAccount(ctx, { domain: "brand.in" }, { exclude: "byDomain" }),
    null,
  );
});

test("unlinkedOnly skips accounts linked to another organisation", async () => {
  const ctx = fakeCtx({ accounts });
  assert.equal(
    await findAccount(
      ctx,
      { gstin: "27AAACB1234C1Z5" },
      { unlinkedOnly: true },
    ),
    null,
  );
});

const people = [
  { _id: "erased", email: "a@brand.in", erasedAt: 1, archivedAt: 1 },
  { _id: "byEmail", email: "a@brand.in" },
  { _id: "byPhone", phone: "+919820012345" },
  { _id: "byUser", platformUserId: "usr_1" },
];

test("people match by platform user, then email, then E.164 phone", async () => {
  const ctx = fakeCtx({ people });
  assert.equal(
    (await findPerson(ctx, { platformUserId: "usr_1", email: "a@brand.in" }))
      ?._id,
    "byUser",
  );
  assert.equal(
    (await findPerson(ctx, { email: " A@Brand.in ", phone: "98200 12345" }))
      ?._id,
    "byEmail",
  );
  assert.equal(
    (await findPerson(ctx, { phone: "098200-12345" }))?._id,
    "byPhone",
  );
  assert.equal(await findPerson(ctx, { email: "b@brand.in" }), null);
  assert.equal(await findPerson(ctx, { email: "a@brand.in" }, "byEmail"), null);
});
