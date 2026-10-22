import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { getSecret, secretEnv } from "../../convex/lib/secrets";
import { failureCode, makeTest, seedTeam } from "./setup";

const MASTER = "a-long-random-master-key-of-32+chars";
const KEY = "sk-live-abcdef-1234";

beforeEach(() => {
  vi.stubEnv("KEYS_ENCRYPTION_KEY", MASTER);
  vi.stubEnv("OPENAI_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function setup() {
  const t = makeTest();
  const team = await seedTeam(t);
  return { t, ...team };
}

async function openai(admin: Awaited<ReturnType<typeof setup>>["admin"]) {
  const status = await admin.as.query(api.secrets.status, {});
  const group = status.groups.find((item) => item.id === "ai")!;
  return group.keys.find((key) => key.name === "OPENAI_API_KEY")!;
}

describe("stored keys", () => {
  it("are encrypted at rest and only the last four characters come back", async () => {
    const { t, admin } = await setup();
    await admin.as.mutation(api.secrets.set, {
      name: "OPENAI_API_KEY",
      value: `  ${KEY}  `,
    });

    const rows = await t.run((ctx) => ctx.db.query("secrets").collect());
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(KEY);
    expect(rows[0].hint).toBe("1234");

    const status = await admin.as.query(api.secrets.status, {});
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(await openai(admin)).toMatchObject({
      source: "stored",
      hint: "1234",
      stored: true,
      updatedBy: "Ada Admin",
    });
  });

  it("show non-secret values in full", async () => {
    const { admin } = await setup();
    await admin.as.mutation(api.secrets.set, {
      name: "AI_MODEL",
      value: "gpt-custom",
    });
    const status = await admin.as.query(api.secrets.status, {});
    const model = status.groups
      .flatMap((group) => group.keys)
      .find((key) => key.name === "AI_MODEL");
    expect(model?.hint).toBe("gpt-custom");
  });

  it("are admin only", async () => {
    const { manager, rep } = await setup();
    for (const actor of [manager, rep]) {
      expect(await failureCode(actor.as.query(api.secrets.status, {}))).toBe(
        "forbidden",
      );
      expect(
        await failureCode(
          actor.as.mutation(api.secrets.set, { name: "AI_MODEL", value: "x" }),
        ),
      ).toBe("forbidden");
      expect(
        await failureCode(
          actor.as.mutation(api.secrets.remove, { name: "AI_MODEL" }),
        ),
      ).toBe("forbidden");
    }
  });

  it("refuse unknown names and bad values", async () => {
    const { admin } = await setup();
    const set = (name: string, value: string) =>
      failureCode(admin.as.mutation(api.secrets.set, { name, value }));
    expect(await set("JWT_PRIVATE_KEY", "x")).toBe("invalid");
    expect(await set("OPENAI_API_KEY", "   ")).toBe("invalid");
    expect(await set("OPENAI_API_KEY", "two words")).toBe("invalid");
    expect(await set("OPENAI_BASE_URL", "not a url")).toBe("invalid");
  });

  it("can't be stored without a master key", async () => {
    vi.stubEnv("KEYS_ENCRYPTION_KEY", "");
    const { t, admin } = await setup();
    expect(
      await failureCode(
        admin.as.mutation(api.secrets.set, {
          name: "OPENAI_API_KEY",
          value: KEY,
        }),
      ),
    ).toBe("unavailable");
    expect((await admin.as.query(api.secrets.status, {})).encryption).toBe(
      false,
    );
    expect(await t.run((ctx) => ctx.db.query("secrets").collect())).toEqual([]);
  });

  it("record who set, rotated and removed a key, never the value", async () => {
    const { t, admin } = await setup();
    const call = (value?: string) =>
      value
        ? admin.as.mutation(api.secrets.set, { name: "KYC_API_TOKEN", value })
        : admin.as.mutation(api.secrets.remove, { name: "KYC_API_TOKEN" });
    await call("first-token-0001");
    await call("second-token-0002");
    await call();
    await call();

    const events = await t.run((ctx) => ctx.db.query("secretEvents").collect());
    expect(events.map((event) => event.action)).toEqual([
      "set",
      "rotate",
      "remove",
    ]);
    expect(events.every((event) => event.actorId === admin.id)).toBe(true);
    expect(JSON.stringify(events)).not.toContain("token-000");
    expect(await t.run((ctx) => ctx.db.query("secrets").collect())).toEqual([]);

    const status = await admin.as.query(api.secrets.status, {});
    expect(status.history.map((item) => item.action)).toEqual([
      "remove",
      "rotate",
      "set",
    ]);
    expect(status.history[0].by).toBe("Ada Admin");
  });
});

describe("resolution", () => {
  it("prefers the environment over a stored key", async () => {
    const { t, admin } = await setup();
    await admin.as.mutation(api.secrets.set, {
      name: "OPENAI_API_KEY",
      value: KEY,
    });
    expect(await t.run((ctx) => getSecret(ctx, "OPENAI_API_KEY"))).toBe(KEY);

    vi.stubEnv("OPENAI_API_KEY", "sk-from-env-9999");
    expect(await t.run((ctx) => getSecret(ctx, "OPENAI_API_KEY"))).toBe(
      "sk-from-env-9999",
    );
    expect(await openai(admin)).toMatchObject({ source: "env", hint: "9999" });
    const env = await t.run((ctx) => secretEnv(ctx));
    expect(env.OPENAI_API_KEY).toBe("sk-from-env-9999");
  });

  it("fills the environment view from stored keys and feeds the feature flags", async () => {
    const { t, admin, rep } = await setup();
    expect(await rep.as.query(api.ai.enabled, {})).toBe(false);
    await admin.as.mutation(api.secrets.set, {
      name: "OPENAI_API_KEY",
      value: KEY,
    });
    await admin.as.mutation(api.secrets.set, {
      name: "AI_MODEL",
      value: "gpt-custom",
    });
    expect(await rep.as.query(api.ai.enabled, {})).toBe(true);
    const env = await t.run((ctx) => secretEnv(ctx));
    expect(env.AI_MODEL).toBe("gpt-custom");
    expect(env.OPENAI_API_KEY).toBe(KEY);

    await admin.as.mutation(api.secrets.remove, { name: "OPENAI_API_KEY" });
    expect(await rep.as.query(api.ai.enabled, {})).toBe(false);
  });

  it("treats a key it can't decrypt as unset", async () => {
    const { t, admin } = await setup();
    await admin.as.mutation(api.secrets.set, {
      name: "OPENAI_API_KEY",
      value: KEY,
    });
    vi.stubEnv("KEYS_ENCRYPTION_KEY", `${MASTER}-rotated`);
    expect(await t.run((ctx) => getSecret(ctx, "OPENAI_API_KEY"))).toBeFalsy();
    expect(
      (await t.run((ctx) => secretEnv(ctx))).OPENAI_API_KEY,
    ).toBeUndefined();
  });

  it("ignores stored keys when there is no master key", async () => {
    const { t, admin } = await setup();
    await admin.as.mutation(api.secrets.set, {
      name: "OPENAI_API_KEY",
      value: KEY,
    });
    vi.stubEnv("KEYS_ENCRYPTION_KEY", "");
    expect(await t.run((ctx) => getSecret(ctx, "OPENAI_API_KEY"))).toBeFalsy();
  });
});
