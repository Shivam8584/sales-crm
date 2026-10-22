import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  failureCode,
  makeTest,
  newAccount,
  seedTeam,
  type Actor,
  type T,
} from "./setup";

async function accountWithFields() {
  const t = makeTest();
  const team = await seedTeam(t);
  const field = (
    label: string,
    type: "text" | "number" | "date" | "select" | "checkbox",
    options?: string[],
  ) =>
    team.admin.as.mutation(api.customFields.create, {
      entity: "account",
      label,
      type,
      options,
    });
  await field("Employees", "number");
  await field("Renewal", "date");
  await field("Tier", "select", ["Gold", "Silver"]);
  await field("Key account", "checkbox");
  const accountId = await newAccount(team.rep, "Globex");
  const set = (key: string, value: string | number | boolean | null) =>
    team.rep.as.mutation(api.customFields.setValue, {
      target: { accountId },
      key,
      value,
    });
  return { t, team, accountId, set };
}

describe("custom fields", () => {
  it("are defined by admins only", async () => {
    const t = makeTest();
    const { manager } = await seedTeam(t);
    expect(
      await failureCode(
        manager.as.mutation(api.customFields.create, {
          entity: "account",
          label: "Region",
          type: "text",
        }),
      ),
    ).toBe("forbidden");
  });

  it("store a value that matches the field type", async () => {
    const { t, accountId, set } = await accountWithFields();
    await set("employees", 40);
    await set("renewal", "2026-04-01");
    await set("tier", "Gold");
    await set("key_account", true);
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.custom).toEqual({
      employees: 40,
      renewal: "2026-04-01",
      tier: "Gold",
      key_account: true,
    });
  });

  it("reject values of the wrong type, a bad date and an unknown option", async () => {
    const { set } = await accountWithFields();
    expect(await failureCode(set("employees", "forty"))).toBe("invalid");
    expect(await failureCode(set("key_account", "yes"))).toBe("invalid");
    expect(await failureCode(set("renewal", "2026-02-31"))).toBe("invalid");
    expect(await failureCode(set("renewal", "next week"))).toBe("invalid");
    expect(await failureCode(set("tier", "Bronze"))).toBe("invalid");
  });

  it("report an unknown field and clear a value with null", async () => {
    const { t, accountId, set } = await accountWithFields();
    expect(await failureCode(set("nope", 1))).toBe("not_found");
    await set("employees", 40);
    expect(await set("employees", null)).toBe(40);
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.custom).toBeUndefined();
  });
});

const PDF = "application/pdf";

async function upload(t: T, bytes: string, type: string) {
  return await t.run((ctx) => ctx.storage.store(new Blob([bytes], { type })));
}

async function attach(
  by: Actor,
  t: T,
  accountId: Id<"accounts">,
  file: { bytes: string; type: string; name?: string },
) {
  const storageId = await upload(t, file.bytes, file.type);
  const result = await by.as.mutation(api.files.attach, {
    target: { accountId },
    storageId,
    name: file.name ?? "contract.pdf",
  });
  return { result, storageId };
}

describe("attachments", () => {
  async function setup() {
    const t = makeTest();
    const team = await seedTeam(t);
    const accountId = await newAccount(team.rep, "Globex");
    return { t, team, accountId };
  }

  it("accept a PDF and keep it on the record", async () => {
    const { t, team, accountId } = await setup();
    const { result } = await attach(team.rep, t, accountId, {
      bytes: "%PDF-1.4",
      type: PDF,
    });
    expect(result.ok).toBe(true);
    const files = await team.rep.as.query(api.files.list, {
      target: { accountId },
    });
    expect(files.map((file) => file.name)).toEqual(["contract.pdf"]);
  });

  it("reject a type that can run scripts and delete the upload", async () => {
    const { t, team, accountId } = await setup();
    const { result, storageId } = await attach(team.rep, t, accountId, {
      bytes: "<script>alert(1)</script>",
      type: "text/html",
      name: "page.html",
    });
    expect(result).toEqual({
      ok: false,
      message: "That file type isn't supported",
    });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("attachments").collect())).toEqual(
      [],
    );
  });

  it("refuse the same upload attached twice", async () => {
    const { t, team, accountId } = await setup();
    const { storageId } = await attach(team.rep, t, accountId, {
      bytes: "%PDF-1.4",
      type: PDF,
    });
    expect(
      await failureCode(
        team.rep.as.mutation(api.files.attach, {
          target: { accountId },
          storageId,
          name: "again.pdf",
        }),
      ),
    ).toBe("conflict");
  });
});
