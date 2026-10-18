import { loadScenarios, type Scenario } from "../../src/baseline/fixtures";
import { regionForScenario } from "../../src/knowledge/coverage";
import { loadKnowledge } from "../../src/knowledge/store";
import { interpretContext } from "../../src/engine/context";
import { planStyleDirections } from "../../src/engine/plan";
import { TemplateConceptWriter } from "../../src/engine/writer";
import type { TextGenerationModel } from "../../src/pipeline/core/generate-outfits";

export const AS_OF = "2026-10-14";
export const store = loadKnowledge();
export const scenarios = loadScenarios();

export const scenario = (id: string): Scenario => {
  const s = scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`no scenario ${id}`);
  return s;
};

export const interpret = (s: Scenario) => interpretContext(s.context, store, { asOf: AS_OF, region: regionForScenario(s) });

/** Template concepts for a scenario as a model would return them (no ids or versions). */
export async function templateDraftJson(s: Scenario): Promise<string> {
  const c = await planStyleDirections(s.context, store, { writer: new TemplateConceptWriter(), asOf: AS_OF, region: regionForScenario(s) });
  return JSON.stringify({ concepts: c.concepts.map(({ id: _id, knowledgeVersion: _v, ...draft }) => draft) });
}

type Reply = string | Error;

/** Replies in order (the last repeats) and records every prompt. */
export class ScriptedModel implements TextGenerationModel {
  readonly prompts: string[] = [];
  constructor(
    private readonly replies: Reply[],
    private readonly usage = false
  ) {}

  async generateContent(prompt: string) {
    const reply = this.replies[Math.min(this.prompts.length, this.replies.length - 1)]!;
    this.prompts.push(prompt);
    if (reply instanceof Error) throw reply;
    return {
      response: {
        text: () => reply,
        usageMetadata: this.usage ? { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 } : undefined,
      },
    };
  }
}

/** Template outfits for a scenario as a model would return them (no ids or versions), plus the collection. */
export async function templateOutfitJson(s: Scenario) {
  const { recommend } = await import("../../src/engine/recommend");
  const { TemplateOutfitWriter } = await import("../../src/engine/outfit-writer");
  const c = await recommend(s.context, store, {
    conceptWriter: new TemplateConceptWriter(),
    outfitWriter: new TemplateOutfitWriter(),
    asOf: AS_OF,
    region: regionForScenario(s),
  });
  const outfits = c.recommendations.map(({ outfit }) => {
    const { id: _id, conceptId: _c, knowledgeVersion: _v, garments, ...rest } = outfit;
    return { ...rest, garments: garments.map(({ id: _g, ...g }) => g) };
  });
  return { json: JSON.stringify({ outfits }), outfits, collection: c };
}
