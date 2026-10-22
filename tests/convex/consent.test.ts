import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  loadSubject,
  recipientFor,
  contactDecision,
} from "../../convex/lib/automations/subject";
import {
  failureCode,
  makeTest,
  newAccount,
  newPerson,
  seedTeam,
} from "./setup";

async function contactWithConsent() {
  const t = makeTest();
  const team = await seedTeam(t);
  const accountId = await newAccount(team.rep, "Globex");
  const personId = await newPerson(team.rep, {
    firstName: "Priya",
    lastName: "Nair",
    email: "priya@globex.com",
    accountId,
  });
  const grant = {
    personId,
    channels: ["email" as const],
    event: "grant" as const,
    purpose: "sales_outreach" as const,
    basis: "consent" as const,
    source: "email" as const,
    note: "Replied yes to our intro email",
  };
  await team.rep.as.mutation(api.consents.record, grant);
  return { t, team, personId, grant };
}

describe("consent gate", () => {
  it("denies contact until a grant is recorded", async () => {
    const t = makeTest();
    const { rep } = await seedTeam(t);
    const personId = await newPerson(rep, {
      firstName: "Dev",
      email: "dev@example.com",
    });
    const decision = await rep.as.query(api.consents.check, {
      personId,
      channel: "email",
      purpose: "sales_outreach",
    });
    expect(decision).toMatchObject({ allowed: false, reason: "no_consent" });
  });

  it("allows contact after a grant and blocks it again once withdrawn", async () => {
    const { t, team, personId } = await contactWithConsent();
    const check = () =>
      team.rep.as.query(api.consents.check, {
        personId,
        channel: "email",
        purpose: "sales_outreach",
      });
    expect(await check()).toMatchObject({ allowed: true });

    await team.rep.as.mutation(api.consents.record, {
      personId,
      channels: ["email"],
      event: "withdraw",
      source: "email",
      note: "Asked us to stop",
    });
    expect(await check()).toMatchObject({
      allowed: false,
      reason: "withdrawn",
    });

    const decision = await t.run(async (ctx) => {
      const subject = await loadSubject(ctx, { kind: "person", id: personId });
      const recipient = await recipientFor(ctx, subject!, "email");
      return await contactDecision(ctx, recipient, "email", "sales_outreach");
    });
    expect(decision).toMatchObject({ allowed: false, reason: "withdrawn" });
  });

  it("lets only an admin carry out an erasure", async () => {
    const { team, personId } = await contactWithConsent();
    const args = { personId, confirmation: "erase" };
    expect(
      await failureCode(team.manager.as.mutation(api.consents.erase, args)),
    ).toBe("forbidden");
    expect(
      await failureCode(
        team.admin.as.mutation(api.consents.erase, {
          ...args,
          confirmation: "yes",
        }),
      ),
    ).toBe("invalid");
  });
});
