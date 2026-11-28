import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for the institutional-memory documents, so an open bug or a
 * lesson cannot silently drop out of view:
 *
 * - BUG_REPORTS.md: every entry carries Severity, Status and Component from the
 *   vocabulary and the required sections; every open entry has an index row (and
 *   no fixed one does); the header's open count is right.
 * - SESSION_LEARNINGS_AND_REGRESSIONS.md: every lesson has its required parts and
 *   a Key Takeaways line.
 * - Both: IDs are unique and well formed (date plus random hex, so parallel PRs
 *   never collide), and every BUG-/LESSON- ID cited in the memory documents
 *   exists.
 */

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const BUG_ID = "BUG-\\d{8}-[0-9a-f]{4}";
const LESSON_ID = "LESSON-\\d{8}-[0-9a-f]{4}";
const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);
const STATUS = /^(Open|Open \(Deferred\)|Blocked — Needs Decision|Fixed \(\d{4}-\d{2}-\d{2}\)|Closed \(By Design, \d{4}-\d{2}-\d{2}\))$/;
const isOpen = (status: string) => /^(Open|Blocked)/.test(status);

interface Entry {
  id: string;
  body: string[];
}

/** Level-2 entries whose heading starts with an ID; any other level-2 heading ends an entry. */
function entries(lines: string[], id: string): Entry[] {
  const out: Entry[] = [];
  let cur: Entry | null = null;
  for (const line of lines) {
    const m = line.match(new RegExp(`^## (${id}):`));
    if (m) {
      cur = { id: m[1]!, body: [] };
      out.push(cur);
    } else if (/^## /.test(line)) cur = null;
    else if (cur) cur.body.push(line);
  }
  return out;
}

const realDate = (id: string) => {
  const d = id.match(/-(\d{8})-/)![1]!;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso;
};

const bugMd = read("BUG_REPORTS.md");
const bugLines = bugMd.split("\n");
const bugs = entries(bugLines, BUG_ID);
const lessonMd = read("SESSION_LEARNINGS_AND_REGRESSIONS.md");
const lessonLines = lessonMd.split("\n");
const lessons = entries(lessonLines, LESSON_ID);

describe("BUG_REPORTS.md", () => {
  const field = (e: Entry, name: string) => e.body.map((l) => l.match(new RegExp(`^\\*\\*${name}:\\*\\* (.+)$`))?.[1]?.trim()).find(Boolean) ?? null;
  // The index is everything before the first real entry (the filing template's example heading is not an ID).
  const firstEntry = bugLines.findIndex((l) => new RegExp(`^## ${BUG_ID}:`).test(l));
  const indexed = new Set(
    bugLines
      .slice(0, firstEntry)
      .filter((l) => new RegExp(`^\\| ${BUG_ID} \\|`).test(l))
      .map((l) => l.match(new RegExp(BUG_ID))![0])
  );

  it("gives every entry a unique, well-formed ID and the required fields and sections", () => {
    expect(bugs.length).toBeGreaterThan(0);
    expect(new Set(bugs.map((e) => e.id)).size).toBe(bugs.length);
    // Every "## BUG-" heading is a well-formed entry, so a malformed ID cannot hide a bug.
    expect(bugLines.slice(firstEntry).filter((l) => /^## BUG-/.test(l)).length).toBe(bugs.length);
    for (const e of bugs) {
      expect(realDate(e.id), `${e.id} date`).toBe(true);
      expect(SEVERITIES.has(field(e, "Severity") ?? ""), `${e.id} Severity`).toBe(true);
      expect(field(e, "Status") ?? "", `${e.id} Status`).toMatch(STATUS);
      expect(field(e, "Component"), `${e.id} Component`).not.toBeNull();
      for (const section of ["### Description", "### Root cause", "### Fix", "### Regression guard", "### References"]) {
        expect(e.body.some((l) => l.startsWith(section)), `${e.id} ${section}`).toBe(true);
      }
    }
  });

  it("indexes every open bug, and only open bugs", () => {
    for (const e of bugs) expect(indexed.has(e.id), `${e.id} (${field(e, "Status")})`).toBe(isOpen(field(e, "Status") ?? ""));
    for (const id of indexed) expect(bugs.some((e) => e.id === id), `${id} has an entry`).toBe(true);
  });

  it("keeps the header's open count current", () => {
    const open = bugs.filter((e) => isOpen(field(e, "Status") ?? "")).length;
    expect(bugMd).toContain(`**Open:** ${open} (of ${bugs.length} filed)`);
  });
});

describe("SESSION_LEARNINGS_AND_REGRESSIONS.md", () => {
  const takeaways = lessonMd.slice(lessonMd.indexOf("## Key Takeaways"), lessonMd.indexOf(`## LESSON-`));

  it("gives every lesson a unique, well-formed ID, its required parts and a Key Takeaways line", () => {
    expect(lessons.length).toBeGreaterThan(0);
    expect(new Set(lessons.map((e) => e.id)).size).toBe(lessons.length);
    expect(lessonLines.filter((l) => /^## LESSON-/.test(l)).length).toBe(lessons.length);
    for (const e of lessons) {
      expect(realDate(e.id), `${e.id} date`).toBe(true);
      for (const part of ["**Context.**", "**The pattern.**", "**What to do.**", "**Applies to.**", "**Guard.**"]) {
        expect(e.body.some((l) => l.startsWith(part)), `${e.id} ${part}`).toBe(true);
      }
      expect(takeaways, `${e.id} in Key Takeaways`).toContain(e.id);
    }
  });
});

describe("cross-references between the memory documents", () => {
  const docs = ["BUG_REPORTS.md", "SESSION_LEARNINGS_AND_REGRESSIONS.md", "ENGINEERING_GUIDELINES.md", ".github/claude-review.md", "REGRESSION_TESTING_CHECKLIST.md", "changelogs/unreleased.md"];

  it("only cite bug and lesson IDs that exist", () => {
    const known = new Set([...bugs, ...lessons].map((e) => e.id));
    for (const doc of docs) {
      expect(existsSync(join(ROOT, doc)), doc).toBe(true);
      for (const id of read(doc).match(new RegExp(`${BUG_ID}|${LESSON_ID}`, "g")) ?? []) expect(known.has(id), `${doc} cites ${id}`).toBe(true);
    }
  });
});
