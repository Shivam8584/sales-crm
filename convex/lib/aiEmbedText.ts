import type { LifecycleStage } from "../../lib/domain/enums";
import { STAGE_LABEL } from "../../lib/domain/labels";
import { truncate } from "./aiContext";

/** Must match the vector index in the schema and the `dimensions` sent to the embeddings endpoint. */
export const EMBED_DIMS = 1536;

/** Cosine score from which a neighbour is "close" rather than "similar"; tune against real embeddings. */
export const CLOSE_SCORE = 0.6;

const ABOUT_MAX = 400;
const TEXT_MAX = 1600;

/** Business facts only: nothing here may identify a person. */
export type EmbedFacts = {
  name: string;
  stage: LifecycleStage;
  tags: string[];
  domain: string | null;
  about: string[];
  platform: string;
  marketplaces: string[];
  categories: string[];
};

const words = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].join(", ");

export function embedText(facts: EmbedFacts): string {
  const lines = [
    `Company: ${facts.name}`,
    `Stage: ${STAGE_LABEL[facts.stage]}`,
    `Platform: ${facts.platform}`,
    facts.domain && `Website: ${facts.domain}`,
    facts.tags.length > 0 && `Tags: ${words(facts.tags)}`,
    facts.marketplaces.length > 0 && `Sells on: ${words(facts.marketplaces)}`,
    facts.categories.length > 0 && `Categories: ${words(facts.categories)}`,
    ...facts.about.map((text) => `About: ${truncate(text, ABOUT_MAX)}`),
  ];
  return truncate(lines.filter(Boolean).join(" | "), TEXT_MAX);
}

/** What two accounts visibly have in common, to say why they were matched. */
export function sharedWords(a: EmbedFacts, b: EmbedFacts): string[] {
  const common = (left: string[], right: string[]) => {
    const other = new Set(right.map((value) => value.toLowerCase()));
    return left.filter((value) => other.has(value.toLowerCase()));
  };
  return [
    ...new Set([
      ...common(a.categories, b.categories),
      ...common(a.marketplaces, b.marketplaces),
      ...common(a.tags, b.tags),
      ...(a.stage === b.stage ? [STAGE_LABEL[a.stage]] : []),
    ]),
  ].slice(0, 3);
}

export function closeness(score: number): "close" | "similar" {
  return score >= CLOSE_SCORE ? "close" : "similar";
}
