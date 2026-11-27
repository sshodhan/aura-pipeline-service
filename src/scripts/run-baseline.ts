/**
 * Phase 0 baseline CLI.
 *
 *   npm run baseline -- [--provider mock|gemini] [--model <id>] [--out <dir>]
 *                       [--date YYYY-MM-DD] [--price-in <usd/1M>] [--price-out <usd/1M>]
 *                       [scenario.json ...]
 *   npm run baseline:volume -- [--out <dir>] [--date YYYY-MM-DD]
 *
 * The mock provider needs no keys and writes to baselines/local/ (git-ignored).
 * The gemini provider needs GEMINI_API_KEY; in proxied environments run Node
 * with NODE_USE_ENV_PROXY=1 so fetch honors HTTPS_PROXY.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { GoogleGenerativeAI } from "@google/generative-ai";

import { PIPELINE_TEXT_MODEL } from "../utils/models";
import { loadScenarios } from "../baseline/fixtures";
import { MockTextModel } from "../baseline/mock-model";
import { analyzeCallVolume, type CallVolumeReport } from "../baseline/analysis";
import {
  runBaseline,
  summarize,
  renderSummaryMarkdown,
  type Pricing,
  type RunOptions,
} from "../baseline/runner";
import type { TextGenerationModel } from "../pipeline/core/generate-outfits";

interface CliArgs {
  provider: "mock" | "gemini";
  model: string;
  out?: string;
  date: string;
  priceIn?: number;
  priceOut?: number;
  volume: boolean;
  files: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    provider: "mock",
    model: PIPELINE_TEXT_MODEL,
    date: new Date().toISOString().slice(0, 10),
    volume: false,
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
      case "--provider": {
        const p = value();
        if (p !== "mock" && p !== "gemini") throw new Error(`Unknown provider: ${p}`);
        args.provider = p;
        break;
      }
      case "--model": args.model = value(); break;
      case "--out": args.out = value(); break;
      case "--date": {
        args.date = value();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error(`--date must be YYYY-MM-DD`);
        break;
      }
      case "--price-in": args.priceIn = Number(value()); break;
      case "--price-out": args.priceOut = Number(value()); break;
      case "--volume": args.volume = true; break;
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

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function renderVolumeMarkdown(report: CallVolumeReport, date: string): string {
  const t = report.totals;
  const lines = [
    `# Nightly call volume (replay of stages 2–3)`,
    "",
    `- Date replayed: ${date}; temperature ranges checked: ${report.temperatureRangesChecked.join(", ")}`,
    `- Matrix size varies with temperature: ${report.entriesVaryWithTemperature ? "yes" : "no"}`,
    `- Gemini calls per nightly run: ${t.geminiCallsPerRun} (up to ${t.worstCaseCallsWithRetries} with 2 retries each)`,
    `- Distinct Redis bundle keys: ${t.distinctBundleKeys}; bundles overwritten because the key omits colorEnergy: ` +
      `${t.overwrittenBundles} (${(t.overwrittenShare * 100).toFixed(1)}%)`,
    `- Occasions never served by any city: ${report.occasionsNeverServed.join(", ") || "none"}`,
    `- Personas never served by any city: ${report.personasNeverServed.join(", ") || "none"}`,
    "",
    "| City | Tier | Tier limit | Matrix entries (calls) | Distinct keys | Overwritten | Occasions served | Personas served |",
    "|---|---|---|---|---|---|---|---|",
    ...report.cities.map(
      (c) =>
        `| ${c.cityId} | ${c.tier} | ${c.tierLimit} | ${c.matrixEntries} | ${c.distinctBundleKeys} | ${c.overwrittenBundles} | ` +
        `${c.occasionsCovered.join(", ")} | ${c.personasCovered.join(", ")} |`
    ),
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (args.volume) {
    const out = resolve(args.out ?? join("baselines", "local", `volume-${stamp}`));
    mkdirSync(out, { recursive: true });
    const month = new Date(`${args.date}T12:00:00Z`).getUTCMonth();
    const report = analyzeCallVolume(args.date, month);
    writeJson(join(out, "call-volume.json"), { date: args.date, gitCommit: gitCommit(), ...report });
    const md = renderVolumeMarkdown(report, args.date);
    writeFileSync(join(out, "call-volume.md"), md);
    console.log(md);
    console.log(`Wrote ${out}`);
    return;
  }

  let model: TextGenerationModel;
  if (args.provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set; use --provider mock or set the key.");
      process.exit(2);
    }
    model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: args.model });
  } else {
    model = new MockTextModel();
  }

  const pricing: Pricing | undefined =
    args.priceIn !== undefined && args.priceOut !== undefined
      ? { inputPerMillionTokensUsd: args.priceIn, outputPerMillionTokensUsd: args.priceOut }
      : undefined;

  const options: RunOptions = {
    provider: args.provider,
    model,
    modelId: args.model,
    modelOverride: args.model !== PIPELINE_TEXT_MODEL,
    date: args.date,
    // Mock runs skip backoff waits; real runs keep the pipeline's timing.
    sleep: args.provider === "mock" ? async () => {} : undefined,
    pricing,
  };

  const scenarios = loadScenarios(args.files);
  const out = resolve(args.out ?? join("baselines", "local", `${args.provider}-${stamp}`));
  mkdirSync(join(out, "scenarios"), { recursive: true });

  const startedAt = new Date().toISOString();
  const results = await runBaseline(scenarios, options);
  const summary = summarize(results, options);

  for (const r of results) writeJson(join(out, "scenarios", `${r.scenario.id}.json`), r);
  writeJson(join(out, "summary.json"), summary);
  writeJson(join(out, "run.json"), {
    startedAt,
    finishedAt: new Date().toISOString(),
    gitCommit: gitCommit(),
    node: process.version,
    provider: args.provider,
    modelId: args.model,
    pipelineModel: PIPELINE_TEXT_MODEL,
    scenarioFiles: args.files.length ? args.files : "fixtures/scenarios/*.json",
  });
  const md = renderSummaryMarkdown(summary, results);
  writeFileSync(join(out, "summary.md"), md);

  console.log(md);
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
