/**
 * End-to-end validation harness CLI.
 *
 *   npm run e2e -- [--writer template|gemini] [--model <id>] [--as-of YYYY-MM-DD] [--out <dir>]
 *
 * Runs every phase against the 20 benchmark scenarios (src/harness) and
 * writes report.json and report.md. Exits 1 if any check fails. Template
 * writers need no keys; --writer gemini reads GEMINI_API_KEY from the
 * environment (or .env) and never imports src/utils/config.ts.
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { loadScenarios } from "../baseline/fixtures";
import { ModelOutfitWriter, TemplateOutfitWriter, type OutfitWriter } from "../engine/outfit-writer";
import { ModelConceptWriter, TemplateConceptWriter, type ConceptWriter } from "../engine/writer";
import { renderHarnessMarkdown, runHarness } from "../harness";
import { loadKnowledge } from "../knowledge/store";
import { PIPELINE_TEXT_MODEL } from "../utils/models";

function parseArgs(argv: string[]) {
  const args = { writer: "template" as "template" | "gemini", model: PIPELINE_TEXT_MODEL, asOf: new Date().toISOString().slice(0, 10), out: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--writer") {
      const w = value();
      if (w !== "template" && w !== "gemini") throw new Error(`Unknown writer: ${w}`);
      args.writer = w;
    } else if (arg === "--model") args.model = value();
    else if (arg === "--as-of") {
      args.asOf = value();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.asOf)) throw new Error("--as-of must be YYYY-MM-DD");
    } else if (arg === "--out") args.out = value();
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function gitCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let conceptWriter: ConceptWriter = new TemplateConceptWriter();
  let outfitWriter: OutfitWriter = new TemplateOutfitWriter();
  if (args.writer === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set; use --writer template or set the key.");
      process.exit(2);
    }
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: args.model, generationConfig: { responseMimeType: "application/json" } });
    conceptWriter = new ModelConceptWriter(model, args.model);
    outfitWriter = new ModelOutfitWriter(model, args.model);
  }

  const report = await runHarness({ store: loadKnowledge(), scenarios: loadScenarios(), asOf: args.asOf, conceptWriter, outfitWriter, gitCommit: gitCommit() });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(args.out ?? join("baselines", "local", `e2e-${args.writer}-${stamp}`));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  const md = renderHarnessMarkdown(report);
  writeFileSync(join(out, "report.md"), md);
  console.log(md);
  console.log(`Wrote ${out}`);
  if (report.totals.fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
