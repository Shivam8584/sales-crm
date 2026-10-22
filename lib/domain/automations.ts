/**
 * Automations: a trigger enrols a record (lead, person, account or deal) into a
 * graph of steps. Everything here is pure so the Convex engine, the dry run and
 * the editor share one definition of triggers, steps, waits and validation.
 */
export * from "./automations-model";
export * from "./automations-time";
export * from "./automations-fields";
export * from "./automations-variables";
export * from "./automations-validate";
export * from "./automations-graph";
export * from "./automations-describe";
export * from "./automations-runs";
export * from "./automations-inbound";
export * from "./automations-simulate";
export type { Channel, Priority } from "./enums";
export type { ConsentPurpose } from "./consent";
