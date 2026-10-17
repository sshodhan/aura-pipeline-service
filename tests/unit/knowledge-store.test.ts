import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  computeContentHash,
  loadKnowledge,
  prepareRelease,
  readKnowledge,
  KnowledgeStore,
} from "../../src/knowledge/store";
import { assessFreshness } from "../../src/knowledge/freshness";
import {
  DATASET,
  EDITORIAL,
  PUBLICATION,
  VERSION,
  aestheticRecord,
  editorialRecord,
  observedRecord,
  writeCorpus,
} from "./knowledge-helpers";

function released(files: Parameters<typeof writeCorpus>[0]) {
  const dir = writeCorpus(files);
  const snapshot = prepareRelease(readKnowledge(dir), VERSION, "2026-10-09", "test release");
  writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot));
  return dir;
}

describe("the checked-in corpus", () => {
  it("loads with no content or release-discipline problems", () => {
    const read = readKnowledge();
    expect(read.issues).toEqual([]);
    expect(read.releaseIssues).toEqual([]);
    const store = loadKnowledge();
    expect(store.knowledgeVersion).toMatch(/^fashion-\d{4}-\d{2}\.\d+$/);
    expect(store.evidence.length).toBeGreaterThan(0);
  });

  it("contains no unsourced external claims and no numeric popularity", () => {
    const store = loadKnowledge();
    for (const e of store.evidence) {
      if (e.basis === "editorial_judgment") {
        expect(e.provenance.every((p) => store.source(p.sourceId)?.kind === "aura_editorial")).toBe(true);
      } else {
        expect(e.sourceCheck?.status).toBe("checked_against_source");
      }
      if (!e.measurement) expect(e.basis).not.toBe("measured");
    }
  });
});

describe("canonical content hash", () => {
  const a = editorialRecord({ id: "tp-a" });
  const b = editorialRecord({ id: "tp-b", summary: "Another principle used to test canonical hashing order." });

  it("ignores record order, key order and file layout", () => {
    const reordered = Object.fromEntries(Object.entries(b).reverse()) as typeof b;
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(b)[0]);
    expect(computeContentHash([EDITORIAL, PUBLICATION], [a, b])).toBe(computeContentHash([PUBLICATION, EDITORIAL], [reordered, a]));
    const oneFile = readKnowledge(writeCorpus({ "x.json": [a, b] }));
    const twoFiles = readKnowledge(writeCorpus({ "x.json": [b], "y.json": [a] }));
    expect(oneFile.contentHash).toBe(twoFiles.contentHash);
  });

  it("changes when content changes", () => {
    expect(computeContentHash([EDITORIAL], [a])).not.toBe(computeContentHash([EDITORIAL], [{ ...a, title: "Changed title" }]));
  });

  it("excludes the snapshot manifest", () => {
    const dir = released({ "x.json": [a] });
    const before = readKnowledge(dir).contentHash;
    const snapshot = JSON.parse(JSON.stringify(readKnowledge(dir).snapshot));
    snapshot.releases[0].notes = "edited release notes";
    writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot));
    expect(readKnowledge(dir).contentHash).toBe(before);
    expect(readKnowledge(dir).releaseIssues).toEqual([]);
  });
});

describe("release discipline", () => {
  const a = editorialRecord({ id: "tp-a" });

  it("flags content edited without a new release", () => {
    const dir = released({ "x.json": [a] });
    writeFileSync(join(dir, "evidence", "x.json"), JSON.stringify([{ ...a, title: "Edited without release" }]));
    expect(readKnowledge(dir).releaseIssues.join("\n")).toMatch(/content changed since release fashion-2026-10\.1/);
  });

  it("refuses reused versions, unchanged content and invalid content", () => {
    const dir = released({ "x.json": [a] });
    expect(() => prepareRelease(readKnowledge(dir), "fashion-2026-10.2", "2026-10-10", "noop")).toThrow(/Nothing to release/);

    writeFileSync(join(dir, "evidence", "x.json"), JSON.stringify([{ ...a, title: "Edited" }]));
    expect(() => prepareRelease(readKnowledge(dir), VERSION, "2026-10-10", "reuse")).toThrow(/already released/);
    const next = prepareRelease(readKnowledge(dir), "fashion-2026-10.2", "2026-10-10", "edit");
    expect(next.releases.map((r) => r.version)).toEqual([VERSION, "fashion-2026-10.2"]);
    expect(next.knowledgeVersion).toBe("fashion-2026-10.2");

    const bad = writeCorpus({ "x.json": [editorialRecord({ provenance: [{ sourceId: "missing-source" }] })] });
    expect(() => prepareRelease(readKnowledge(bad), VERSION, "2026-10-09", "bad")).toThrow(/fix content problems/);
  });

  it("requires every record to cite a released version", () => {
    const dir = released({ "x.json": [a] });
    writeFileSync(join(dir, "evidence", "x.json"), JSON.stringify([{ ...a, knowledgeVersion: "fashion-2099-01.1" }]));
    expect(readKnowledge(dir).releaseIssues.join("\n")).toMatch(/is not a release/);
  });
});

describe("integrity rules", () => {
  const issuesFor = (records: Parameters<typeof editorialRecord>[0][], sources = [EDITORIAL, PUBLICATION, DATASET]) =>
    readKnowledge(writeCorpus({ "x.json": records.map((r) => editorialRecord(r)) }, sources)).issues.join("\n");

  it("catches unknown sources, duplicate ids and undefined aesthetics", () => {
    expect(issuesFor([{ provenance: [{ sourceId: "nope" }] }])).toMatch(/unknown source nope/);
    expect(issuesFor([{ id: "tp-x" }, { id: "tp-x" }])).toMatch(/duplicate evidence id: tp-x/);
    expect(issuesFor([{ aesthetics: ["undefined-look"] }])).toMatch(/not defined by an aesthetic_reference/);
  });

  it("keeps external observations external and measurements on datasets", () => {
    const onlyEditorial = observedRecord({ provenance: [{ sourceId: "aura-editorial" }] });
    expect(readKnowledge(writeCorpus({ "x.json": [onlyEditorial] })).issues.join("\n")).toMatch(/must cite a publication, brand or dataset/);

    const noUrl = observedRecord({ provenance: [{ sourceId: "example-pub" }] });
    expect(readKnowledge(writeCorpus({ "x.json": [noUrl] })).issues.join("\n")).toMatch(/needs a sourceUrl/);

    const measuredFromPublication = observedRecord({
      basis: "measured",
      measurement: { metric: "m", value: 1, method: "x", sourceId: "example-pub", measuredAt: "2026-09-01" },
    });
    expect(readKnowledge(writeCorpus({ "x.json": [measuredFromPublication] })).issues.join("\n")).toMatch(/must come from a dataset/);
  });
});

describe("freshness: review-due is not the same as expired", () => {
  it("timeless principles never expire, they only become due for review", () => {
    const f = assessFreshness(editorialRecord(), "2036-01-01");
    expect(f).toMatchObject({ timeSensitive: false, validity: "current", review: "review_due" });
  });

  it("contemporary observations expire after validUntil and are not yet valid before validFrom", () => {
    const e = observedRecord({ validFrom: "2026-03-01", validUntil: "2026-09-30" });
    expect(assessFreshness(e, "2026-06-01")).toMatchObject({ timeSensitive: true, validity: "current" });
    expect(assessFreshness(e, "2026-10-09")).toMatchObject({ validity: "expired" });
    expect(assessFreshness(e, "2026-02-01")).toMatchObject({ validity: "not_yet_valid" });
  });

  it("regional influences are durable unless they set validUntil", () => {
    const durable = editorialRecord({ type: "regional_influence", regions: ["new-york-ny"] });
    expect(assessFreshness(durable, "2027-06-01")).toMatchObject({ timeSensitive: false, validity: "current", review: "review_due" });
    const dated = { ...durable, validUntil: "2027-01-01" };
    expect(assessFreshness(dated, "2027-06-01")).toMatchObject({ timeSensitive: true, validity: "expired" });
  });
});

describe("queries", () => {
  const store = loadKnowledge(
    released({
      "x.json": [
        editorialRecord({ id: "tp-any" }),
        editorialRecord({ id: "tp-footwear", garmentCategories: ["footwear"] }),
        editorialRecord({ id: "tp-old", editorialStatus: "historical" }),
        aestheticRecord("coastal", { relevantSeasons: ["summer"] }),
        aestheticRecord("utility"),
        editorialRecord({ id: "ri-nyc", type: "regional_influence", regions: ["new-york-ny"] }),
        observedRecord({ id: "co-expired", validFrom: "2026-01-01", validUntil: "2026-06-30" }),
        observedRecord({ id: "co-current" }),
      ],
    })
  );
  const ids = (q: Parameters<KnowledgeStore["query"]>[0]) => store.query({ asOf: "2026-10-09", ...q }).map((h) => h.evidence.id);

  it("excludes historical and expired records by default", () => {
    expect(ids({})).not.toContain("tp-old");
    expect(ids({})).not.toContain("co-expired");
    expect(ids({ includeExpired: true })).toContain("co-expired");
    expect(ids({ statuses: ["historical"] })).toEqual(["tp-old"]);
  });

  it("filters by type, aesthetic, season, region and garment category", () => {
    expect(ids({ types: ["aesthetic_reference"] })).toEqual(["ar-coastal", "ar-utility"]);
    expect(ids({ aesthetics: ["utility"] })).toEqual(["ar-utility"]);
    expect(ids({ types: ["aesthetic_reference"], season: "winter" })).toEqual(["ar-utility"]);
    expect(ids({ regions: ["new-york-ny"], includeGlobal: false })).toEqual(["ri-nyc"]);
    expect(ids({ regions: ["london"] })).not.toContain("ri-nyc");
    expect(ids({ types: ["timeless_principle"], garmentCategories: ["top"] })).toEqual(["tp-any"]);
  });

  it("returns review-due records with their flag rather than hiding them", () => {
    const hit = store.query({ asOf: "2028-01-01", types: ["timeless_principle"] })[0]!;
    expect(hit.freshness.review).toBe("review_due");
  });
});
