/**
 * Mock Text Model
 *
 * Deterministic stand-in for Gemini so the baseline runner and tests work
 * without API keys. Its outfits are placeholders labeled "[mock]": they
 * exercise parsing, scoring and reporting, and say nothing about quality.
 */

import type { TextGenerationModel } from "../pipeline/core/generate-outfits";

export type MockBehavior = "ok" | "fewer" | "malformed" | "throw";

export interface MockModelOptions {
  /** Behavior per call, in order; the last entry repeats. Default: ["ok"]. */
  script?: MockBehavior[];
  /** Attach synthetic usageMetadata (chars/4). Off by default so mock runs never report fake token counts. */
  reportUsage?: boolean;
}

export class MockTextModel implements TextGenerationModel {
  readonly prompts: string[] = [];
  private readonly script: MockBehavior[];
  private readonly reportUsage: boolean;

  constructor(options: MockModelOptions = {}) {
    this.script = options.script && options.script.length > 0 ? options.script : ["ok"];
    this.reportUsage = options.reportUsage ?? false;
  }

  get calls(): number {
    return this.prompts.length;
  }

  async generateContent(prompt: string) {
    const behavior = this.script[Math.min(this.prompts.length, this.script.length - 1)]!;
    this.prompts.push(prompt);

    if (behavior === "throw") {
      throw new Error("[mock] provider unavailable");
    }

    const text =
      behavior === "malformed"
        ? "[mock] Here are some outfits you might like!"
        : "```json\n" + JSON.stringify(mockOutfits(behavior === "fewer" ? 2 : 3), null, 2) + "\n```";

    return {
      response: {
        text: () => text,
        usageMetadata: this.reportUsage
          ? {
              promptTokenCount: Math.ceil(prompt.length / 4),
              candidatesTokenCount: Math.ceil(text.length / 4),
              totalTokenCount: Math.ceil(prompt.length / 4) + Math.ceil(text.length / 4),
            }
          : undefined,
      },
    };
  }
}

function mockOutfits(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    items: [
      { category: "top", name: `[mock] top ${i + 1}`, description: "placeholder", color: "grey", colorHex: "#808080", fabric: "cotton" },
      { category: "bottom", name: `[mock] bottom ${i + 1}`, description: "placeholder", color: "navy", colorHex: "#000080", fabric: "denim" },
      { category: "outerwear", name: `[mock] outerwear ${i + 1}`, description: "placeholder", color: "black", colorHex: "#000000", fabric: "wool" },
      { category: "footwear", name: `[mock] footwear ${i + 1}`, description: "placeholder", color: "brown", colorHex: "#5c4033", fabric: "leather" },
    ],
    styling: {
      overallVibe: "[mock] placeholder",
      colorStory: "[mock] placeholder",
      silhouetteProfile: "[mock] placeholder",
      occasionFit: "[mock] placeholder",
    },
    rationale: "[mock] placeholder rationale",
  }));
}
