/**
 * End-to-end validation harness: shared types.
 *
 * The harness runs every phase of the service against the 20 benchmark
 * scenarios and records each check as pass, fail, manual (a person must
 * judge it) or skipped. It never scores taste: "manual" is the honest answer
 * for anything a deterministic check cannot decide.
 */

import type { TextGenerationModel } from "../pipeline/core/generate-outfits";

export const HARNESS_SECTIONS = [
  "phase0-baseline",
  "phase1-knowledge",
  "phase2-concepts",
  "phase3-outfits",
  "phase4-quality",
  "input-parity",
  "fixture-expectations",
  "adversarial",
  "consumer-adapter",
  "live-model",
] as const;
export type HarnessSection = (typeof HARNESS_SECTIONS)[number];

export type CheckStatus = "pass" | "fail" | "manual" | "skipped";

export interface HarnessCheck {
  section: HarnessSection;
  id: string;
  scenarioId?: string;
  status: CheckStatus;
  title: string;
  /** Why it failed, what a person should look at, or what was measured. */
  detail?: string;
}

export interface HarnessReport {
  harnessVersion: string;
  asOf: string;
  writer: "template" | "gemini";
  modelId: string | null;
  knowledgeVersion: string;
  engineVersions: { concepts: string; recommend: string };
  gitCommit: string | null;
  durationMs: number;
  totals: Record<CheckStatus, number>;
  bySection: Record<HarnessSection, Record<CheckStatus, number>>;
  checks: HarnessCheck[];
  /** Counts that describe the run rather than pass or fail it. */
  measurements: Record<string, number | string>;
}

type Reply = string | Error | ((prompt: string) => string);

/** A deterministic stand-in model: replies in order (the last repeats) and records every prompt. */
export class ScriptedModel implements TextGenerationModel {
  readonly prompts: string[] = [];
  constructor(private readonly replies: Reply[]) {}

  async generateContent(prompt: string) {
    const reply = this.replies[Math.min(this.prompts.length, this.replies.length - 1)]!;
    this.prompts.push(prompt);
    if (reply instanceof Error) throw reply;
    const text = typeof reply === "function" ? reply(prompt) : reply;
    return { response: { text: () => text } };
  }
}
