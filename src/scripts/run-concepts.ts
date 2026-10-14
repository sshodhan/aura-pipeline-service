/**
 * Style direction runner (Phase 2).
 *
 *   npm run concepts -- [--writer template|gemini] [--model <id>] [--out <dir>]
 *                       [--as-of YYYY-MM-DD] [--max-calls N] [--save-prompts] [scenario.json ...]
 *
 * Runs the benchmark scenarios (fixtures/scenarios by default) through the
 * style direction engine and writes one collection per scenario plus
 * summary.json and summary.md. The template writer needs no keys. The gemini
 * writer reads GEMINI_API_KEY from the environment (or .env) and never
 * imports src/utils/config.ts.
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { loadScenarios } from "../baseline/fixtures";
import { loadKnowledge } from "../knowledge/store";
import { renderConceptSummaryMarkdown, runConceptScenarios, summarizeConceptRun } from "../engine/runner";
import { DEFAULT_MAX_MODEL_CALLS } from "../engine/plan";
import { ENGINE_VERSION } from "../engine/types";
import { ModelConceptWriter, TemplateConceptWriter, type ConceptWriter } from "../engine/writer";
import { PIPELINE_TEXT_MODEL } from "../utils/models";

interface Args {
  writer: "template" | "gemini";
  model: string;
  out?: string;
  asOf: string;
  maxCalls: number;
  savePrompts: boolean;
  files: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    writer: "template",
    model: PIPELINE_TEXT_MODEL,
    asOf: new Date().toISOString().slice(0, 10),
    maxCalls: DEFAULT_MAX_MODEL_CALLS,
    savePrompts: false,
    files: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--writer": {
        const w = value();
        if (w !== "template" && w !== "gemini") throw new Error(`Unknown writer: ${w} (use template or gemini)`);
        args.writer = w;
        break;
      }
      case "--model": args.model = value(); break;
      case "--out": args.out = value(); break;
      case "--as-of": {
        args.asOf = value();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(args.asOf)) throw new Error("--as-of must be YYYY-MM-DD");
        break;
      }
      case "--max-calls": {
        args.maxCalls = Number(value());
        if (!Number.isInteger(args.maxCalls) || args.maxCalls < 1) throw new Error("--max-calls must be a positive integer");
        break;
      }
      case "--save-prompts": args.savePrompts = true; break;
      default:
        if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
        args.files.push(arg);
    }
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

const writeJson = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let writer: ConceptWriter;
  if (args.writer === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set; use --writer template or set the key.");
      process.exit(2);
    }
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: args.model,
      generationConfig: { responseMimeType: "application/json" },
    });
    writer = new ModelConceptWriter(model, args.model);
  } else {
    writer = new TemplateConceptWriter();
  }

  const store = loadKnowledge();
  const scenarios = loadScenarios(args.files);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = resolve(args.out ?? join("baselines", "local", `concepts-${args.writer}-${stamp}`));
  mkdirSync(join(out, "scenarios"), { recursive: true });
  if (args.savePrompts) mkdirSync(join(out, "prompts"), { recursive: true });

  const results = await runConceptScenarios(scenarios, {
    store,
    writer,
    asOf: args.asOf,
    maxModelCalls: args.maxCalls,
    onPrompt: args.savePrompts ? (id, prompt, call) => writeFileSync(join(out, "prompts", `${id}-call${call}.txt`), prompt) : undefined,
  });
  for (const r of results) writeJson(join(out, "scenarios", `${r.scenarioId}.json`), r.collection);

  const summary = summarizeConceptRun(results);
  const meta = {
    writer: args.writer,
    modelId: writer.modelId,
    asOf: args.asOf,
    knowledgeVersion: store.knowledgeVersion,
    engineVersion: ENGINE_VERSION,
    gitCommit: gitCommit(),
  };
  writeJson(join(out, "summary.json"), { ...meta, ...summary });
  const md = renderConceptSummaryMarkdown(summary, meta);
  writeFileSync(join(out, "summary.md"), md);
  console.log(md);
  console.log(`Wrote ${out}`);
  if (summary.validCollections < summary.scenarios) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
