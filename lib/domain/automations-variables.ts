import {
  type GraphNode,
  SUBJECT_KINDS,
  SUBJECT_LABEL,
  type SubjectKind,
} from "./automations-model";

// ── Templates ({{variables}}) ───────────────────────────────────────────────

export const VARIABLE_GROUPS = [
  "Recipient",
  "Account",
  "Lead",
  "Deal",
  "Owner",
  "Platform",
  "Prospect",
  "Record",
] as const;
export type VariableGroup = (typeof VARIABLE_GROUPS)[number];

export type VariableDef = {
  key: string;
  label: string;
  group: VariableGroup;
  /** Records the value can exist for; elsewhere the variable is a mistake. */
  subjects: readonly SubjectKind[];
  example: string;
};

export const VARIABLES: readonly VariableDef[] = [
  {
    key: "person.firstName",
    label: "First name",
    group: "Recipient",
    subjects: SUBJECT_KINDS,
    example: "Asha",
  },
  {
    key: "person.lastName",
    label: "Last name",
    group: "Recipient",
    subjects: SUBJECT_KINDS,
    example: "Menon",
  },
  {
    key: "person.fullName",
    label: "Full name",
    group: "Recipient",
    subjects: SUBJECT_KINDS,
    example: "Asha Menon",
  },
  {
    key: "person.title",
    label: "Job title",
    group: "Recipient",
    subjects: SUBJECT_KINDS,
    example: "Founder",
  },
  {
    key: "person.email",
    label: "Email",
    group: "Recipient",
    subjects: SUBJECT_KINDS,
    example: "asha@kesar.in",
  },
  {
    key: "account.name",
    label: "Company name",
    group: "Account",
    subjects: SUBJECT_KINDS,
    example: "Kesar Foods",
  },
  {
    key: "account.domain",
    label: "Website",
    group: "Account",
    subjects: SUBJECT_KINDS,
    example: "kesar.in",
  },
  {
    key: "account.stage",
    label: "Stage",
    group: "Account",
    subjects: SUBJECT_KINDS,
    example: "Funded",
  },
  {
    key: "lead.source",
    label: "Source",
    group: "Lead",
    subjects: ["lead"],
    example: "Website",
  },
  {
    key: "lead.kind",
    label: "Kind",
    group: "Lead",
    subjects: ["lead"],
    example: "Demo request",
  },
  {
    key: "lead.company",
    label: "Company on the form",
    group: "Lead",
    subjects: ["lead"],
    example: "Kesar Foods",
  },
  {
    key: "deal.title",
    label: "Title",
    group: "Deal",
    subjects: ["deal"],
    example: "Diwali launch",
  },
  {
    key: "deal.amount",
    label: "Amount",
    group: "Deal",
    subjects: ["deal"],
    example: "₹2,50,000",
  },
  {
    key: "deal.stage",
    label: "Stage",
    group: "Deal",
    subjects: ["deal"],
    example: "Proposal",
  },
  {
    key: "owner.name",
    label: "Owner's name",
    group: "Owner",
    subjects: SUBJECT_KINDS,
    example: "Shivam Gupta",
  },
  {
    key: "owner.firstName",
    label: "Owner's first name",
    group: "Owner",
    subjects: SUBJECT_KINDS,
    example: "Shivam",
  },
  {
    key: "owner.email",
    label: "Owner's email",
    group: "Owner",
    subjects: SUBJECT_KINDS,
    example: "shivam@hypedrive.in",
  },
  {
    key: "platform.balance",
    label: "Wallet balance",
    group: "Platform",
    subjects: SUBJECT_KINDS,
    example: "₹12,500",
  },
  {
    key: "platform.liveCampaigns",
    label: "Live campaigns",
    group: "Platform",
    subjects: SUBJECT_KINDS,
    example: "2",
  },
  {
    key: "platform.stage",
    label: "Activation stage",
    group: "Platform",
    subjects: SUBJECT_KINDS,
    example: "First campaign live",
  },
  {
    key: "prospect.talkingPoint",
    label: "Talking point",
    group: "Prospect",
    subjects: SUBJECT_KINDS,
    example: "your 4.1★ rating on Nykaa",
  },
  {
    key: "record.name",
    label: "Record name",
    group: "Record",
    subjects: SUBJECT_KINDS,
    example: "Kesar Foods",
  },
  {
    key: "survey.link",
    label: "NPS survey link",
    group: "Record",
    subjects: ["lead", "person", "account"],
    example: "https://sales.hypedrive.app/survey/preview",
  },
];

export const VARIABLE = new Map(VARIABLES.map((item) => [item.key, item]));

/** Names used before the dotted library, still accepted in saved messages. */
export const VARIABLE_ALIASES: Record<string, string> = {
  first_name: "person.firstName",
  name: "record.name",
  company: "account.name",
  owner_name: "owner.name",
  owner_first_name: "owner.firstName",
  deal_title: "deal.title",
};

/** `prospect.*` values are supplied per record at enrolment, so any name there is allowed. */
const PROSPECT_KEY = /^prospect\.[a-zA-Z][a-zA-Z0-9]{0,39}$/;

export const canonicalVariable = (name: string) =>
  VARIABLE_ALIASES[name] ?? name;

export function variableDef(name: string): VariableDef | undefined {
  const key = canonicalVariable(name);
  const known = VARIABLE.get(key);
  if (known) return known;
  if (PROSPECT_KEY.test(key)) {
    return {
      key,
      label: key.slice("prospect.".length),
      group: "Prospect",
      subjects: SUBJECT_KINDS,
      example: "",
    };
  }
  return undefined;
}

export const variablesFor = (subject: SubjectKind) =>
  VARIABLES.filter((item) => item.subjects.includes(subject));

const TOKEN = /\{\{\s*([A-Za-z_][\w.]*)\s*(?:\|([^{}]*))?\}\}/g;

export type TemplateToken = { name: string; fallback: string | null };

export function templateTokens(text: string): TemplateToken[] {
  return [...text.matchAll(TOKEN)].map((match) => ({
    name: match[1],
    fallback: match[2] === undefined ? null : match[2].trim(),
  }));
}

export function templateVariables(text: string) {
  return templateTokens(text).map((token) => token.name);
}

/**
 * Fills `{{variables}}`, using `{{name|fallback}}` when the value is empty
 * (`{{name|}}` allows blank); `missing` lists the ones left empty with no fallback.
 */
export function renderTemplate(
  text: string,
  vars: Partial<Record<string, string>>,
) {
  const missing = new Set<string>();
  const out = text.replace(TOKEN, (_, name: string, fallback?: string) => {
    const value = vars[canonicalVariable(name)] ?? vars[name];
    if (value) return value;
    if (fallback !== undefined) return fallback.trim();
    missing.add(name);
    return "";
  });
  return { text: out, missing: [...missing] };
}

/** Unknown names, and names that can never have a value for this kind of record. */
export function templateIssues(text: string, subject: SubjectKind) {
  const issues: string[] = [];
  for (const { name } of templateTokens(text)) {
    const def = variableDef(name);
    if (!def) issues.push(`Unknown variable {{${name}}}`);
    else if (!def.subjects.includes(subject)) {
      issues.push(
        `{{${name}}} is always empty for ${SUBJECT_LABEL[subject][1]}`,
      );
    }
  }
  return [...new Set(issues)];
}

/** The message steps' text, for previews and the missing-value check. */
export function nodeTexts(node: Pick<GraphNode, "kind" | "config">) {
  const config = node.config as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  switch (node.kind) {
    case "send_email":
      return [text(config.subject), text(config.body)];
    case "send_whatsapp":
      return Array.isArray(config.params) ? config.params.map(text) : [];
    case "create_task":
      return [text(config.title), text(config.notes)];
    case "notify":
      return [text(config.message)];
    default:
      return [];
  }
}

/** Why a message wasn't sent when variables came out empty. */
export function missingMessage(missing: string[]) {
  const names = missing.map((name) => `{{${name}}}`);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${list} ${names.length === 1 ? "has" : "have"} no value for this record. Add a fallback like {{${missing[0]}|there}}, or {{${missing[0]}|}} to leave it blank.`;
}
