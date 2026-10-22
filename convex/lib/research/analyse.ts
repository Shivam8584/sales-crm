import type { MutationCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import {
  applyToRecord,
  factsFor,
  observe,
  supersede,
  type Ledger,
} from "../../enrichment";
import { sameValue, sourceFamily } from "../enrichment/kyc";
import { contextHash, truncate, withoutErased, wrapData } from "../aiContext";
import { ownDomains } from "../emailLog";
import { istDay } from "../../../lib/domain/day";
import { personName } from "../../../lib/domain/labels";
import {
  AGENT_SOURCES,
  AUTO_FIELDS,
  SUMMARY_INPUT_CHARS,
  domainFinding,
  domainTie,
  findingStep,
  identityOf,
  personFindings,
  signerConflicts,
  unansweredEmails,
  type Finding,
} from "../../../lib/domain/research";
import { researchable, type Subject } from "./queue";
import { ask, questionsFor } from "./questions";
import { addSteps } from "./steps";

const ENTRIES = 40;
const PEOPLE = 50;

const isAgent = (fact: Doc<"facts">) =>
  (AGENT_SOURCES as readonly string[]).includes(sourceFamily(fact.source));

/**
 * Stores what the history says. A strong finding fills a field only while it
 * is empty and nobody has set, cleared or rejected that value; everything else
 * becomes a suggestion for a person. Returns the fields still awaiting review
 * and logs each new finding to `steps`.
 */
async function record(
  ctx: MutationCtx,
  target: Subject,
  findings: Finding[],
  current: Record<string, string | undefined>,
  steps: string[],
) {
  const active = (await factsFor(ctx, target)).filter(
    (fact) => fact.status !== "superseded" && isAgent(fact),
  );
  const pending = (field: string) =>
    active.filter(
      (fact) => fact.field === field && fact.status === "suggested",
    );

  for (const finding of findings) {
    const known = current[finding.field];
    if (sameValue(known, finding.value)) {
      await supersede(ctx, pending(finding.field));
      continue;
    }
    const seen = active.some(
      (fact) =>
        fact.field === finding.field && sameValue(fact.value, finding.value),
    );
    const fill =
      finding.strong &&
      !known &&
      !seen &&
      (AUTO_FIELDS as readonly string[]).includes(finding.field);
    if (fill) {
      await applyToRecord(
        ctx,
        { ...target, field: finding.field },
        finding.value,
        undefined,
      );
      current[finding.field] = finding.value;
    }
    if (!seen) steps.push(findingStep(finding, fill));
    const ledger: Ledger = {
      ctx,
      target,
      source: finding.source,
      evidence: finding.evidence,
      observedAt: finding.at,
      active,
    };
    await observe(
      ledger,
      {
        field: finding.field,
        value: finding.value,
        confidence: finding.confidence,
        strength: "signal",
      },
      fill ? "applied" : "suggested",
    );
  }
  for (const [field, value] of Object.entries(current)) {
    await supersede(
      ctx,
      pending(field).filter((fact) => sameValue(value, fact.value)),
    );
  }
  return new Set(
    active.filter((fact) => fact.status === "suggested").map((f) => f.field),
  );
}

async function history(
  record: Record<string, string | undefined>,
  entries: Doc<"timeline">[],
) {
  const rows = entries
    .filter((entry) => entry.kind !== "change" && entry.kind !== "system")
    .slice(0, 20)
    .map((entry) => ({
      kind: entry.kind,
      direction: entry.direction,
      on: istDay(entry.occurredAt),
      subject: truncate(entry.subject, 80),
      text: truncate(entry.body, 300),
    }));
  if (rows.length === 0) return { input: null, hash: null };
  const data = { record, history: rows };
  while (JSON.stringify(data).length > SUMMARY_INPUT_CHARS && rows.length > 1) {
    rows.pop();
  }
  return { input: wrapData(data), hash: await contextHash(data) };
}

export type Analysis = {
  /** Set when the account has something the waterfall can look up. */
  lookUp?: Doc<"accounts">["_id"];
  unanswered: number;
  jobChange: boolean;
  missing: string[];
  input: string | null;
  hash: string | null;
};

/** Reads the CRM's own history for a task's record and records findings; null when the record is gone. */
export async function analyse(
  ctx: MutationCtx,
  task: Doc<"researchTasks">,
): Promise<Analysis | null> {
  if (task.personId) {
    const person = await ctx.db.get(task.personId);
    if (!researchable(person) || !("firstName" in person)) {
      await ctx.db.delete(task._id);
      return null;
    }
    const account = person.accountId
      ? await ctx.db.get(person.accountId)
      : null;
    const entries = await ctx.db
      .query("timeline")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .order("desc")
      .take(ENTRIES);
    const current: Record<string, string | undefined> = {
      phone: person.phone,
      title: person.title,
      linkedinUrl: person.linkedinUrl,
    };
    const subject = { personId: person._id };
    const facts = {
      firstName: person.firstName,
      lastName: person.lastName,
      accountName: account?.name,
      accountDomain: account?.domain,
    };
    const steps = [`Checked ${entries.length} recent entries in the history`];
    const questions = await questionsFor(ctx, subject);
    const identity = identityOf(questions);
    const siblings = person.accountId
      ? (
          await ctx.db
            .query("people")
            .withIndex("by_account", (q) => q.eq("accountId", person.accountId))
            .take(PEOPLE)
        ).filter((other) => other._id !== person._id && researchable(other))
      : [];
    const conflicts = signerConflicts(
      facts,
      entries,
      siblings.map((other) => ({ ...other, id: other._id })),
      questions.filter((row) => row.kind === "signer").map((row) => row.key),
    );
    for (const conflict of conflicts) {
      const other = siblings.find((item) => item._id === conflict.otherId)!;
      const prompt = `An email is signed "${conflict.signed}". Is that ${personName(person)} or ${personName(other)}?`;
      await ask(ctx, subject, questions, {
        kind: "signer",
        key: conflict.key,
        prompt,
        evidence: conflict.evidence,
        options: [
          { value: "self", label: personName(person) },
          { value: "other", label: personName(other) },
        ],
        refPersonId: other._id,
      });
      identity.skip.push(conflict.key);
      steps.push(`Asked: ${prompt}`);
    }
    const pending = await record(
      ctx,
      subject,
      personFindings(facts, entries, identity),
      current,
      steps,
    );
    await addSteps(ctx, subject, steps);
    return {
      unanswered: unansweredEmails(entries),
      jobChange: pending.has("employment"),
      missing: [
        ...(current.phone ? [] : ["phone"]),
        ...(current.title ? [] : ["title"]),
      ],
      ...(await history(
        {
          name: `${person.firstName} ${person.lastName}`.trim(),
          title: current.title,
          account: account?.name,
        },
        entries,
      )),
    };
  }

  const account = task.accountId ? await ctx.db.get(task.accountId) : null;
  if (!researchable(account) || !("stage" in account)) {
    await ctx.db.delete(task._id);
    return null;
  }
  const everyone = await ctx.db
    .query("people")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .take(PEOPLE);
  const erased = new Set<string>(
    everyone.filter((person) => person.erasedAt).map((person) => person._id),
  );
  const people = everyone.filter((person) => researchable(person));
  const entries = withoutErased(
    await ctx.db
      .query("timeline")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .order("desc")
      .take(ENTRIES),
    erased,
  );
  const emails = people.flatMap((person) =>
    person.email ? [person.email] : [],
  );
  const finding = domainFinding(account, emails, ownDomains(), Date.now());
  const current: Record<string, string | undefined> = {
    domain: account.domain,
  };
  const subject = { accountId: account._id };
  const steps = [`Checked ${entries.length} recent entries in the history`];
  const tie = domainTie(account, emails, ownDomains());
  if (tie) {
    const prompt = `Which website is ${account.name}'s? Contacts write from ${tie.length} company domains.`;
    const filed = await ask(ctx, subject, await questionsFor(ctx, subject), {
      kind: "domain",
      key: tie
        .map((item) => item.domain)
        .sort()
        .join("|"),
      prompt,
      options: tie.map((item) => ({
        value: item.domain,
        label: `${item.domain} · ${item.emails.length} ${item.emails.length === 1 ? "contact" : "contacts"}`,
      })),
    });
    if (filed) steps.push(`Asked: ${prompt}`);
  }
  await record(ctx, subject, finding ? [finding] : [], current, steps);
  const lookUp =
    account.gstin || account.domain || account.platformOrgId
      ? account._id
      : undefined;
  if (!lookUp) {
    steps.push(
      "Skipped the enrichment providers: no website, GSTIN or platform link to look up",
    );
  }
  await addSteps(ctx, subject, steps);
  return {
    lookUp,
    unanswered: unansweredEmails(entries),
    jobChange: false,
    missing: [
      ...(account.domain ? [] : ["website"]),
      ...(account.gstin ? [] : ["GSTIN"]),
    ],
    ...(await history(
      { name: account.name, stage: account.stage, website: account.domain },
      entries,
    )),
  };
}
