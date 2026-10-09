/**
 * Fashion knowledge CLI.
 *
 *   npm run knowledge:status   -- [--as-of YYYY-MM-DD] [--json]
 *   npm run knowledge:release  -- --version fashion-YYYY-MM.N --notes "<what changed>"
 *   npm run knowledge:coverage -- [--as-of YYYY-MM-DD] [--json] [scenario.json ...]
 *
 * status   Version, counts by type and editorial status, freshness, and
 *          validation results. Read-only; exit 1 on any problem. Local preview
 *          of the planned GET /v1/knowledge/status.
 * release  Appends a release to knowledge/snapshot.json for the current
 *          content. The only supported way to change the ledger; refuses
 *          reused versions, unchanged content and invalid content.
 * coverage Knowledge available to each benchmark scenario (no thresholds).
 */

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { EDITORIAL_STATUSES, EVIDENCE_TYPES } from "../knowledge/schema";
import { assessFreshness } from "../knowledge/freshness";
import { DEFAULT_KNOWLEDGE_DIR, loadKnowledge, prepareRelease, readKnowledge } from "../knowledge/store";
import { scenarioCoverage } from "../knowledge/coverage";
import { loadScenarios } from "../baseline/fixtures";

interface Args {
  command: string;
  asOf: string;
  dir: string;
  json: boolean;
  version?: string;
  notes?: string;
  files: string[];
}

function parseArgs(argv: string[]): Args {
  const [command = "status", ...rest] = argv;
  const args: Args = { command, asOf: new Date().toISOString().slice(0, 10), dir: DEFAULT_KNOWLEDGE_DIR, json: false, files: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    const value = () => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--as-of") args.asOf = value();
    else if (a === "--dir") args.dir = resolve(value());
    else if (a === "--json") args.json = true;
    else if (a === "--version") args.version = value();
    else if (a === "--notes") args.notes = value();
    else if (a.startsWith("--")) throw new Error(`Unknown option: ${a}`);
    else args.files.push(a);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.asOf)) throw new Error("--as-of must be YYYY-MM-DD");
  return args;
}

function status(args: Args): number {
  const read = readKnowledge(args.dir);
  const { snapshot, evidence, issues, releaseIssues } = read;
  const fresh = evidence.map((e) => ({ e, f: assessFreshness(e, args.asOf) }));
  const byStatus = (type: string) =>
    Object.fromEntries(
      EDITORIAL_STATUSES.map((s) => [s, evidence.filter((e) => e.type === type && e.editorialStatus === s).length])
    ) as Record<(typeof EDITORIAL_STATUSES)[number], number>;
  const counts = EVIDENCE_TYPES.map((type) => ({
    type,
    ...byStatus(type),
    sourceChecked: evidence.filter((e) => e.type === type && e.sourceCheck?.status === "checked_against_source").length,
  }));
  const expired = fresh.filter((x) => x.f.validity !== "current").map((x) => ({ id: x.e.id, validity: x.f.validity, validUntil: x.f.validUntil }));
  const reviewDue = fresh.filter((x) => x.f.review === "review_due").map((x) => ({ id: x.e.id, reviewDueOn: x.f.reviewDueOn }));
  const latest = snapshot?.releases.at(-1);

  const report = {
    knowledgeVersion: snapshot?.knowledgeVersion ?? null,
    latestRelease: latest ?? null,
    releases: snapshot?.releases.length ?? 0,
    contentHash: read.contentHash,
    asOf: args.asOf,
    records: evidence.length,
    sources: read.sources.length,
    counts,
    expiredOrNotYetValid: expired,
    reviewDue,
    contentIssues: issues,
    releaseIssues,
  };

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Fashion knowledge ${report.knowledgeVersion ?? "(unreleased)"} · ${report.records} records · ${report.sources} sources · as of ${args.asOf}`);
    if (latest) console.log(`Latest release: ${latest.version} on ${latest.releasedAt} (${latest.contentHash.slice(0, 12)}…) — ${latest.notes}`);
    console.log("");
    console.log("| Type | approved | provisional | historical | source-checked |");
    console.log("|---|---|---|---|---|");
    for (const c of counts) console.log(`| ${c.type} | ${c.approved} | ${c.provisional} | ${c.historical} | ${c.sourceChecked} |`);
    console.log("");
    console.log(`Expired / not yet valid (time-sensitive): ${expired.length === 0 ? "none" : expired.map((x) => `${x.id} (${x.validity})`).join(", ")}`);
    console.log(`Due for editorial review: ${reviewDue.length === 0 ? "none" : reviewDue.map((x) => `${x.id} (since ${x.reviewDueOn})`).join(", ")}`);
    console.log(issues.length === 0 ? "Content validation: OK" : `Content validation: ${issues.length} problem(s)\n- ${issues.join("\n- ")}`);
    console.log(releaseIssues.length === 0 ? "Release discipline: OK" : `Release discipline: ${releaseIssues.length} problem(s)\n- ${releaseIssues.join("\n- ")}`);
  }
  return issues.length + releaseIssues.length === 0 ? 0 : 1;
}

function release(args: Args): number {
  if (!args.version || !args.notes) throw new Error('release needs --version fashion-YYYY-MM.N and --notes "<what changed>"');
  const read = readKnowledge(args.dir);
  const snapshot = prepareRelease(read, args.version, args.asOf, args.notes);
  writeFileSync(join(args.dir, "snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Released ${snapshot.knowledgeVersion} (${read.contentHash.slice(0, 12)}…) with ${read.evidence.length} records.`);
  const after = readKnowledge(args.dir);
  if (after.releaseIssues.length > 0) {
    console.log(`Release discipline problems remain:\n- ${after.releaseIssues.join("\n- ")}`);
    return 1;
  }
  return 0;
}

function coverage(args: Args): number {
  const store = loadKnowledge(args.dir);
  const rows = scenarioCoverage(store, loadScenarios(args.files), args.asOf);
  if (args.json) {
    console.log(JSON.stringify({ knowledgeVersion: store.knowledgeVersion, asOf: args.asOf, scenarios: rows }, null, 2));
    return 0;
  }
  console.log(`Knowledge coverage · ${store.knowledgeVersion} · as of ${args.asOf} (${rows[0]?.season ?? "-"})`);
  console.log("");
  console.log("| Scenario | Region | Timeless | Aesthetic | Regional | Contemporary | Notes |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.scenarioId} | ${r.region} | ${r.counts.timeless_principle} | ${r.counts.aesthetic_reference} | ` +
        `${r.counts.regional_influence} | ${r.counts.contemporary_observation} | ${r.notes.join("; ") || "–"} |`
    );
  }
  return 0;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const commands: Record<string, (a: Args) => number> = { status, release, coverage };
  const run = commands[args.command];
  if (!run) throw new Error(`Unknown command: ${args.command} (use status, release or coverage)`);
  process.exit(run(args));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
