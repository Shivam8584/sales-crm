import type { LeadKind } from "./enums";
import { HOT_MIN, type EmailType } from "./scoring";

export const MAX_ROUTING_RULES = 10;
const MAX_RULE_NAME = 60;
const MAX_SOURCE = 60;

export type RuleCondition = {
  kind?: LeadKind;
  source?: string;
  scoreMin?: number;
  hasGst?: boolean;
  emailType?: EmailType;
};

export type RoutingRule<Member extends string = string> = {
  id: string;
  name: string;
  when: RuleCondition;
  assign: { memberId: Member } | { roundRobin: true };
};

export type RoutingFacts = {
  kind: LeadKind;
  source: string;
  score: number;
  hasGst: boolean;
  emailType: EmailType | null;
};

function matches(when: RuleCondition, facts: RoutingFacts) {
  return (
    (when.kind === undefined || when.kind === facts.kind) &&
    (when.source === undefined || when.source === facts.source) &&
    (when.scoreMin === undefined || facts.score >= when.scoreMin) &&
    (when.hasGst === undefined || when.hasGst === facts.hasGst) &&
    (when.emailType === undefined || when.emailType === facts.emailType)
  );
}

/**
 * First rule, top to bottom, whose conditions all hold. A rule naming a member
 * who is no longer active is skipped; `memberId` is null for a round-robin rule.
 */
export function routeLead<Member extends string>(
  rules: RoutingRule<Member>[],
  facts: RoutingFacts,
  isActive: (memberId: Member) => boolean,
) {
  for (const rule of rules) {
    if (!matches(rule.when, facts)) continue;
    if ("roundRobin" in rule.assign) return { rule, memberId: null };
    if (isActive(rule.assign.memberId)) {
      return { rule, memberId: rule.assign.memberId };
    }
  }
  return null;
}

export function rulesProblem(rules: RoutingRule<string>[]) {
  if (rules.length > MAX_ROUTING_RULES) {
    return `Keep it to ${MAX_ROUTING_RULES} rules or fewer`;
  }
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) return "Rule ids must be unique";
    ids.add(rule.id);
    const name = rule.name.trim();
    if (!name || name.length > MAX_RULE_NAME) {
      return `Name each rule in up to ${MAX_RULE_NAME} characters`;
    }
    const { scoreMin, source } = rule.when;
    if (
      scoreMin !== undefined &&
      (!Number.isInteger(scoreMin) || scoreMin < 1 || scoreMin > 100)
    ) {
      return "Minimum score is a whole number from 1 to 100";
    }
    if (
      source !== undefined &&
      (!source.trim() || source.length > MAX_SOURCE)
    ) {
      return "Source is empty or too long";
    }
  }
  return null;
}

/** Stored rules, or none when the value is missing or malformed. */
export function parseRules<Member extends string = string>(
  raw: string | null,
): RoutingRule<Member>[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as RoutingRule<Member>[]) : [];
  } catch {
    return [];
  }
}

const KIND_PHRASE: Record<LeadKind, string> = {
  demo: "a demo request",
  contact: "a contact request",
  signup: "a platform signup",
  manual: "added by hand",
};

/** "A demo request · score 70+ · company email" for the rules list. */
export function describeCondition(
  when: RuleCondition,
  sourceLabel: (source: string) => string = (source) => source,
) {
  const parts: string[] = [];
  if (when.kind) parts.push(KIND_PHRASE[when.kind]);
  if (when.source) parts.push(`from ${sourceLabel(when.source)}`);
  if (when.scoreMin !== undefined) {
    parts.push(
      when.scoreMin === HOT_MIN ? "hot (score 70+)" : `score ${when.scoreMin}+`,
    );
  }
  if (when.emailType) {
    parts.push(when.emailType === "company" ? "company email" : "free email");
  }
  if (when.hasGst !== undefined) {
    parts.push(when.hasGst ? "with a GSTIN" : "without a GSTIN");
  }
  if (parts.length === 0) return "Any lead";
  const text = parts.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
