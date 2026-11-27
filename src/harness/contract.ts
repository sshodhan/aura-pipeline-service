/**
 * The contract a consumer relies on, whatever the input: both stages pass
 * their checks and every outfit conforms to the published draft schema
 * (lengths, enums, required fields).
 */

import { outfitDraftSchema, type RecommendationCollection } from "../engine/outfit-types";

export function contractProblems(c: RecommendationCollection): string[] {
  const problems: string[] = [];
  if (!c.validation.concepts?.passed) problems.push(`concept checks: ${c.validation.concepts?.issues.map((i) => i.code).join(", ")}`);
  if (!c.validation.outfits?.passed) problems.push(`outfit checks: ${c.validation.outfits?.issues.map((i) => i.code).join(", ")}`);
  for (const { outfit } of c.recommendations) {
    const { id: _i, conceptId: _c, knowledgeVersion: _k, garments, ...rest } = outfit;
    const parsed = outfitDraftSchema.safeParse({ ...rest, garments: garments.map(({ id: _g, ...g }) => g) });
    if (!parsed.success) {
      problems.push(`${outfit.role} outfit breaks the schema: ${parsed.error.issues.slice(0, 2).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
  }
  return problems;
}
