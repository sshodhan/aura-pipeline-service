import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FashionEvidence, KnowledgeSnapshot, KnowledgeSource } from "../../src/knowledge/schema";

export const EDITORIAL: KnowledgeSource = {
  id: "aura-editorial",
  name: "Aura editorial",
  kind: "aura_editorial",
  usageNote: "test",
};
export const PUBLICATION: KnowledgeSource = {
  id: "example-pub",
  name: "Example Publication",
  kind: "publication",
  url: "https://example.com",
  usageNote: "test",
};
export const DATASET: KnowledgeSource = {
  id: "example-data",
  name: "Example Dataset",
  kind: "dataset",
  url: "https://example.com/data",
  usageNote: "test",
};

export const VERSION = "fashion-2026-10.1";

export function editorialRecord(overrides: Partial<FashionEvidence> = {}): FashionEvidence {
  return {
    id: "tp-test",
    type: "timeless_principle",
    title: "Test principle",
    summary: "A test principle about balancing proportions in an outfit.",
    basis: "editorial_judgment",
    aesthetics: [],
    garmentCategories: [],
    silhouettes: [],
    materials: [],
    regions: ["global"],
    relevantSeasons: ["spring", "summer", "fall", "winter"],
    provenance: [{ sourceId: "aura-editorial" }],
    editorialStatus: "provisional",
    editorialReview: { lastReviewedAt: "2026-10-09", reviewedBy: "test" },
    knowledgeVersion: VERSION,
    ...overrides,
  };
}

export function aestheticRecord(slug: string, overrides: Partial<FashionEvidence> = {}): FashionEvidence {
  return editorialRecord({
    id: `ar-${slug}`,
    type: "aesthetic_reference",
    title: `Aesthetic ${slug}`,
    summary: `Defining description of the ${slug} aesthetic for tests.`,
    aesthetics: [slug],
    ...overrides,
  });
}

export function observedRecord(overrides: Partial<FashionEvidence> = {}): FashionEvidence {
  return editorialRecord({
    id: "co-test",
    type: "contemporary_observation",
    title: "Observed trend",
    summary: "An external publication reports wider trouser shapes this season.",
    basis: "external_observation",
    regions: ["global"],
    relevantSeasons: ["fall", "winter"],
    provenance: [{ sourceId: "example-pub", sourceUrl: "https://example.com/a", publishedAt: "2026-03-01", accessedAt: "2026-10-09" }],
    sourceCheck: { status: "checked_against_source", checkedAt: "2026-10-09", method: "full_page_read" },
    validFrom: "2026-03-01",
    validUntil: "2027-02-28",
    ...overrides,
  });
}

/** Writes a corpus to a fresh temp dir; snapshot omitted unless given. */
export function writeCorpus(
  files: Record<string, FashionEvidence[]>,
  sources: KnowledgeSource[] = [EDITORIAL, PUBLICATION, DATASET],
  snapshot?: KnowledgeSnapshot
): string {
  const dir = mkdtempSync(join(tmpdir(), "aura-knowledge-"));
  mkdirSync(join(dir, "evidence"));
  writeFileSync(join(dir, "sources.json"), JSON.stringify(sources));
  for (const [name, records] of Object.entries(files)) {
    writeFileSync(join(dir, "evidence", name), JSON.stringify(records));
  }
  if (snapshot) writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot));
  return dir;
}
