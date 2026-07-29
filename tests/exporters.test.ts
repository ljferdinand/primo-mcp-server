import { describe, it, expect } from "vitest";
import type { PrimoRecord } from "../src/models.js";
import { exportBibtex, exportRis, exportCsv } from "../src/exporters.js";

function rec(partial: Partial<PrimoRecord>): PrimoRecord {
  return {
    recordId: "",
    sourceId: "",
    sourceSystem: "",
    title: "",
    resourceType: "",
    language: "",
    creators: [],
    contributors: [],
    publisher: "",
    creationDate: "",
    sourceLabel: "",
    description: "",
    snippet: "",
    subjects: [],
    keywords: [],
    isPartOf: "",
    identifiers: [],
    doi: "",
    isbn: [],
    issn: [],
    journalTitle: "",
    volume: "",
    issue: "",
    startPage: "",
    endPage: "",
    peerReviewed: false,
    risType: "",
    authorsStructured: [],
    fulltextAvailable: false,
    deliveryCategory: "",
    score: 0,
    context: "",
    ...partial,
  };
}

const article = rec({
  recordId: "cdi_1",
  resourceType: "article",
  creators: ["Smith, Jane Anne", "Doe, John"],
  creationDate: "2021",
  title: "Deep Learning.",
  journalTitle: "Journal of AI",
  volume: "12",
  issue: "3",
  startPage: "45",
  endPage: "67",
  doi: "10.1/x",
  issn: ["1234-5678"],
  subjects: ["AI", "ML"],
  description: "An abstract.",
  language: "eng",
});

describe("exportBibtex", () => {
  const out = exportBibtex([article]);

  it("builds an @article entry with a key and core fields", () => {
    expect(out).toContain("@article{smith2021deep,");
    expect(out).toContain("author = {Smith, Jane Anne and Doe, John}");
    expect(out).toContain("title = {Deep Learning.}");
    expect(out).toContain("journal = {Journal of AI}");
    expect(out).toContain("pages = {45--67}");
    expect(out).toContain("doi = {10.1/x}");
    expect(out).toContain("issn = {1234-5678}");
  });

  it("escapes special characters", () => {
    const r = rec({ resourceType: "book", title: "Cats & Dogs", creationDate: "2020", creators: ["A, B"] });
    expect(exportBibtex([r])).toContain("title = {Cats \\& Dogs}");
  });

  it("disambiguates duplicate keys with a letter suffix", () => {
    const dup = exportBibtex([article, article]);
    expect(dup).toContain("@article{smith2021deep,");
    expect(dup).toContain("@article{smith2021deepb,");
  });

  it("uses @book for non-article types", () => {
    const r = rec({ resourceType: "book", title: "A Book", creationDate: "2019", creators: ["Author, Ann"] });
    expect(exportBibtex([r])).toContain("@book{author2019a,");
  });
});

describe("exportRis", () => {
  const out = exportRis([article]);

  it("emits tagged lines with the right type", () => {
    expect(out).toContain("TY  - JOUR");
    expect(out).toContain("AU  - Smith, Jane Anne");
    expect(out).toContain("AU  - Doe, John");
    expect(out).toContain("TI  - Deep Learning.");
    expect(out).toContain("DO  - 10.1/x");
    expect(out).toContain("SN  - 1234-5678");
    expect(out).toContain("KW  - AI");
    expect(out).toContain("LA  - eng");
    expect(out.endsWith("ER  - ")).toBe(true);
  });
});

describe("exportCsv", () => {
  const out = exportCsv([article]);

  it("starts with a UTF-8 BOM and a header row", () => {
    expect(out.startsWith("\ufeff")).toBe(true);
    expect(out).toContain("Record ID,Title,Authors,Year,Type,Journal");
  });

  it("quotes fields that contain commas", () => {
    // The Authors field contains commas ("Smith, Jane Anne"), so it is quoted.
    expect(out).toContain('"Smith, Jane Anne; Doe, John"');
  });

  it("quotes and escapes embedded double quotes", () => {
    const r = rec({ resourceType: "article", title: 'The "Best" Paper', creationDate: "2020" });
    expect(exportCsv([r])).toContain('"The ""Best"" Paper"');
  });
});
