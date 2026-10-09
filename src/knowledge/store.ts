/**
 * Fashion Knowledge Store
 *
 * Loads the versioned corpus in knowledge/ (snapshot.json, sources.json,
 * evidence/*.json), validates it, and answers queries for later phases.
 * Pure and key-free: no config, network or model calls.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  EVIDENCE_TYPES,
  GLOBAL_REGION,
  evidenceSchema,
  releaseSchema,
  snapshotSchema,
  sourceSchema,
  type EditorialStatus,
  type EvidenceType,
  type FashionEvidence,
  type KnowledgeSeason,
  type KnowledgeSnapshot,
  type KnowledgeSource,
} from "./schema";
import { assessFreshness, type Freshness } from "./freshness";

export const DEFAULT_KNOWLEDGE_DIR = resolve(__dirname, "../../knowledge");

const today = () => new Date().toISOString().slice(0, 10);

// =============================================================================
// Canonical content hash
// =============================================================================

/** Code-unit string order: deterministic across locales and ICU versions. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort(byCodeUnit)
        .map((k) => [k, canonical(obj[k])])
    );
  }
  return value;
}

/**
 * Canonical content hash of the corpus (hex sha256):
 *  1. take every source and every evidence record as parsed objects;
 *  2. sort sources and records by id (code-unit order);
 *  3. sort object keys recursively (code-unit order); keep array order,
 *     since list order can carry meaning (e.g. provenance order);
 *  4. serialize {"evidence": [...], "sources": [...]} with JSON.stringify
 *     (no whitespace) and hash the UTF-8 bytes.
 * snapshot.json is never part of the input, and neither is which evidence file
 * a record lives in, so reorganizing files or editing release notes does not
 * change the hash.
 */
export function computeContentHash(sources: KnowledgeSource[], evidence: FashionEvidence[]): string {
  const body = {
    evidence: [...evidence].sort((a, b) => byCodeUnit(a.id, b.id)),
    sources: [...sources].sort((a, b) => byCodeUnit(a.id, b.id)),
  };
  return createHash("sha256").update(JSON.stringify(canonical(body)), "utf8").digest("hex");
}

export function countByType(evidence: FashionEvidence[]): Record<EvidenceType, number> {
  return Object.fromEntries(
    EVIDENCE_TYPES.map((t) => [t, evidence.filter((e) => e.type === t).length])
  ) as Record<EvidenceType, number>;
}

// =============================================================================
// Reading and validation
// =============================================================================

export interface KnowledgeReadResult {
  snapshot: KnowledgeSnapshot | null;
  sources: KnowledgeSource[];
  evidence: FashionEvidence[];
  /** Canonical hash of the parsed content on disk. */
  contentHash: string;
  /** Content problems: schema, integrity. */
  issues: string[];
  /** Release-discipline problems: ledger, version bumps, counts. */
  releaseIssues: string[];
}

function readJson(path: string, issues: string[]): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    issues.push(`${path}: ${(error as Error).message}`);
    return undefined;
  }
}

function formatZod(where: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${where}${i.path.length ? `.${i.path.join(".")}` : ""}: ${i.message}`);
}

/** Reads and validates the corpus, collecting every problem instead of stopping at the first. */
export function readKnowledge(dir: string = DEFAULT_KNOWLEDGE_DIR): KnowledgeReadResult {
  const issues: string[] = [];
  const releaseIssues: string[] = [];

  let snapshot: KnowledgeSnapshot | null = null;
  const snapshotPath = join(dir, "snapshot.json");
  if (!existsSync(snapshotPath)) releaseIssues.push("snapshot.json is missing; run npm run knowledge:release");
  else {
    const raw = readJson(snapshotPath, releaseIssues);
    const parsed = snapshotSchema.safeParse(raw);
    if (parsed.success) snapshot = parsed.data;
    else if (raw !== undefined) releaseIssues.push(...formatZod("snapshot", parsed.error));
  }

  const sources: KnowledgeSource[] = [];
  const rawSources = readJson(join(dir, "sources.json"), issues);
  if (rawSources !== undefined) {
    if (!Array.isArray(rawSources)) issues.push("sources.json: expected an array");
    else
      rawSources.forEach((s, i) => {
        const p = sourceSchema.safeParse(s);
        if (p.success) sources.push(p.data);
        else issues.push(...formatZod(`sources[${i}]`, p.error));
      });
  }

  const evidence: FashionEvidence[] = [];
  const evidenceDir = join(dir, "evidence");
  const files = existsSync(evidenceDir) ? readdirSync(evidenceDir).filter((f) => f.endsWith(".json")).sort() : [];
  if (files.length === 0) issues.push(`${evidenceDir}: no evidence files`);
  for (const file of files) {
    const raw = readJson(join(evidenceDir, file), issues);
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) {
      issues.push(`evidence/${file}: expected an array`);
      continue;
    }
    raw.forEach((e, i) => {
      const p = evidenceSchema.safeParse(e);
      if (p.success) evidence.push(p.data);
      else issues.push(...formatZod(`evidence/${file}[${i}]`, p.error));
    });
  }

  issues.push(...checkIntegrity(sources, evidence));
  const contentHash = computeContentHash(sources, evidence);
  if (snapshot) releaseIssues.push(...checkReleaseDiscipline(snapshot, evidence, contentHash));
  return { snapshot, sources, evidence, contentHash, issues, releaseIssues };
}

function checkIntegrity(sources: KnowledgeSource[], evidence: FashionEvidence[]): string[] {
  const issues: string[] = [];
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const dupes = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  for (const id of dupes(sources.map((s) => s.id))) issues.push(`duplicate source id: ${id}`);
  for (const id of dupes(evidence.map((e) => e.id))) issues.push(`duplicate evidence id: ${id}`);

  // The aesthetic vocabulary is the set of aesthetic_reference records.
  const vocabulary = new Set(evidence.filter((e) => e.type === "aesthetic_reference").flatMap((e) => e.aesthetics));

  for (const e of evidence) {
    const kinds = e.provenance.map((p) => sourceById.get(p.sourceId)?.kind);
    for (const p of e.provenance) {
      if (!sourceById.has(p.sourceId)) issues.push(`${e.id}: unknown source ${p.sourceId}`);
    }
    const external = kinds.some((k) => k === "publication" || k === "brand" || k === "dataset");
    if (e.basis !== "editorial_judgment" && !external) {
      issues.push(`${e.id}: ${e.basis} evidence must cite a publication, brand or dataset source`);
    }
    if (e.basis !== "editorial_judgment" && e.provenance.some((p) => sourceById.get(p.sourceId)?.kind !== "aura_editorial" && !p.sourceUrl)) {
      issues.push(`${e.id}: external provenance needs a sourceUrl`);
    }
    if (e.basis === "editorial_judgment" && kinds.some((k) => k !== "aura_editorial")) {
      issues.push(`${e.id}: editorial judgment should cite only Aura editorial; use external_observation for sourced claims`);
    }
    if (e.measurement) {
      const m = sourceById.get(e.measurement.sourceId);
      if (!m) issues.push(`${e.id}: unknown measurement source ${e.measurement.sourceId}`);
      else if (m.kind !== "dataset") issues.push(`${e.id}: measurements must come from a dataset source`);
    }
    if (kinds.includes("legacy_unsourced") && e.editorialStatus === "approved") {
      issues.push(`${e.id}: legacy unsourced evidence cannot be approved`);
    }
    for (const a of e.aesthetics) {
      if (!vocabulary.has(a)) issues.push(`${e.id}: aesthetic "${a}" is not defined by an aesthetic_reference`);
    }
  }
  return issues;
}

/**
 * Version-bump discipline, separate from hashing:
 * - the ledger is append-only with unique versions;
 * - every release changes content (consecutive hashes differ);
 * - the current content must equal the latest release (no unreleased edits);
 * - every record cites a released version.
 * Releases are added only by `npm run knowledge:release -- --version <new>`.
 */
function checkReleaseDiscipline(snapshot: KnowledgeSnapshot, evidence: FashionEvidence[], contentHash: string): string[] {
  const issues: string[] = [];
  const versions = snapshot.releases.map((r) => r.version);
  if (new Set(versions).size !== versions.length) issues.push("snapshot.releases has duplicate versions");
  snapshot.releases.forEach((r, i) => {
    if (i > 0 && r.contentHash === snapshot.releases[i - 1]!.contentHash) {
      issues.push(`release ${r.version} does not change content from ${snapshot.releases[i - 1]!.version}`);
    }
  });
  const latest = snapshot.releases[snapshot.releases.length - 1]!;
  if (latest.contentHash !== contentHash) {
    issues.push(
      `content changed since release ${latest.version} (now ${contentHash.slice(0, 12)}…); ` +
        `run npm run knowledge:release -- --version <new version> --notes "<what changed>"`
    );
  }
  for (const e of evidence) {
    if (!versions.includes(e.knowledgeVersion)) issues.push(`${e.id}: knowledgeVersion ${e.knowledgeVersion} is not a release`);
  }
  const counts = countByType(evidence);
  for (const t of EVIDENCE_TYPES) {
    if ((snapshot.counts[t] ?? 0) !== counts[t]) issues.push(`snapshot.counts.${t} is ${snapshot.counts[t] ?? 0}, content has ${counts[t]}`);
  }
  return issues;
}

/**
 * Builds the next snapshot for a release. Refuses to reuse a version, to
 * release over content problems, or to release unchanged content.
 */
export function prepareRelease(
  read: KnowledgeReadResult,
  version: string,
  releasedAt: string,
  notes: string
): KnowledgeSnapshot {
  if (read.issues.length > 0) throw new Error(`Cannot release: fix content problems first:\n- ${read.issues.join("\n- ")}`);
  const release = releaseSchema.parse({ version, contentHash: read.contentHash, releasedAt, notes });
  const previous = read.snapshot?.releases ?? [];
  if (previous.some((r) => r.version === version)) throw new Error(`Version ${version} was already released; choose a new version`);
  if (previous.length > 0 && previous[previous.length - 1]!.contentHash === read.contentHash) {
    throw new Error("Nothing to release: content is unchanged since the latest release");
  }
  return snapshotSchema.parse({
    knowledgeVersion: version,
    releases: [...previous, release],
    counts: countByType(read.evidence),
  });
}

// =============================================================================
// Store
// =============================================================================

export interface KnowledgeQuery {
  types?: EvidenceType[];
  /** Match records tagged with any of these aesthetics. */
  aesthetics?: string[];
  /** Match records for any of these regions; global records are included unless includeGlobal is false. */
  regions?: string[];
  includeGlobal?: boolean;
  season?: KnowledgeSeason;
  /** Match records about any of these categories, plus records not tied to a category. */
  garmentCategories?: FashionEvidence["garmentCategories"];
  /** Default: approved and provisional. Historical records are opt-in. */
  statuses?: EditorialStatus[];
  /** Date for freshness checks (YYYY-MM-DD); defaults to today. */
  asOf?: string;
  /** Include expired and not-yet-valid time-sensitive records (excluded by default). */
  includeExpired?: boolean;
}

export interface KnowledgeHit {
  evidence: FashionEvidence;
  freshness: Freshness;
}

const STATUS_RANK: Record<EditorialStatus, number> = { approved: 0, provisional: 1, historical: 2 };

export class KnowledgeStore {
  private readonly byId: Map<string, FashionEvidence>;

  constructor(
    readonly snapshot: KnowledgeSnapshot,
    readonly sources: KnowledgeSource[],
    readonly evidence: FashionEvidence[]
  ) {
    this.byId = new Map(evidence.map((e) => [e.id, e]));
  }

  get knowledgeVersion(): string {
    return this.snapshot.knowledgeVersion;
  }

  get(id: string): FashionEvidence | undefined {
    return this.byId.get(id);
  }

  source(id: string): KnowledgeSource | undefined {
    return this.sources.find((s) => s.id === id);
  }

  /** Defined aesthetics (the aesthetic_reference vocabulary). */
  aesthetics(): string[] {
    return this.evidence.filter((e) => e.type === "aesthetic_reference").map((e) => e.aesthetics[0]!).sort(byCodeUnit);
  }

  query(q: KnowledgeQuery = {}): KnowledgeHit[] {
    const asOf = q.asOf ?? today();
    const statuses = q.statuses ?? ["approved", "provisional"];
    const includeGlobal = q.includeGlobal ?? true;

    return this.evidence
      .filter((e) => !q.types || q.types.includes(e.type))
      .filter((e) => statuses.includes(e.editorialStatus))
      .filter((e) => !q.aesthetics || e.aesthetics.some((a) => q.aesthetics!.includes(a)))
      .filter(
        (e) =>
          !q.regions ||
          e.regions.some((r) => q.regions!.includes(r)) ||
          (includeGlobal && e.regions.includes(GLOBAL_REGION))
      )
      .filter((e) => !q.season || e.relevantSeasons.includes(q.season))
      .filter(
        (e) =>
          !q.garmentCategories ||
          e.garmentCategories.length === 0 ||
          e.garmentCategories.some((c) => q.garmentCategories!.includes(c))
      )
      .map((evidence) => ({ evidence, freshness: assessFreshness(evidence, asOf) }))
      .filter((h) => q.includeExpired || h.freshness.validity === "current")
      .sort(
        (a, b) =>
          STATUS_RANK[a.evidence.editorialStatus] - STATUS_RANK[b.evidence.editorialStatus] ||
          EVIDENCE_TYPES.indexOf(a.evidence.type) - EVIDENCE_TYPES.indexOf(b.evidence.type) ||
          byCodeUnit(a.evidence.id, b.evidence.id)
      );
  }
}

export class KnowledgeValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Fashion knowledge is invalid:\n- ${issues.join("\n- ")}`);
  }
}

/** Loads a valid, released corpus or throws with every problem found. */
export function loadKnowledge(dir: string = DEFAULT_KNOWLEDGE_DIR): KnowledgeStore {
  const read = readKnowledge(dir);
  const problems = [...read.issues, ...read.releaseIssues];
  if (problems.length > 0 || !read.snapshot) throw new KnowledgeValidationError(problems);
  return new KnowledgeStore(read.snapshot, read.sources, read.evidence);
}
