import { describe, it, expect } from "vitest";
import type { PrimoRecord, SearchResponse } from "../src/models.js";
import {
  formatSearchResults,
  formatRecordDetail,
  formatSuggestions,
} from "../src/formatter.js";

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

describe("formatSearchResults", () => {
  const response: SearchResponse = {
    info: { total: 1234, totalLocal: 0, totalPc: 0, first: 1, last: 1 },
    records: [
      rec({
        recordId: "cdi_1",
        title: "Deep Learning for Ventures",
        resourceType: "article",
        creators: ["Smith, Jane", "Doe, John", "Roe, Ann", "Poe, Ed"],
        creationDate: "2021-05-01",
        journalTitle: "J. Things",
        volume: "12",
        issue: "3",
        startPage: "45",
        endPage: "67",
        doi: "10.1/x",
        peerReviewed: true,
        fulltextAvailable: true,
      }),
    ],
  };

  const out = formatSearchResults(response, "deep learning", 0, "PittCat");

  it("shows a grouped total and the range", () => {
    expect(out).toContain('Found 1,234 results for "deep learning" (showing 1-1)');
  });

  it("truncates authors with et al. and shows year and type", () => {
    expect(out).toContain("Smith, Jane; Doe, John; Roe, Ann et al. | 2021 | Article");
  });

  it("shows journal, identifiers, peer-review and record id", () => {
    expect(out).toContain("J. Things, 12(3), pp. 45-67 | DOI: 10.1/x");
    expect(out).toContain("Peer-reviewed | Full text available");
    expect(out).toContain("Record ID: cdi_1");
  });

  it("uses the discovery name in the availability fallback", () => {
    const noAvail: SearchResponse = {
      info: { total: 1, totalLocal: 0, totalPc: 0, first: 1, last: 1 },
      records: [rec({ recordId: "r", title: "T", resourceType: "book" })],
    };
    const s = formatSearchResults(noAvail, "t", 0, "PittCat");
    expect(s).toContain("Check availability in PittCat");
  });

  it("returns a no-results block when empty", () => {
    const empty: SearchResponse = {
      info: { total: 0, totalLocal: 0, totalPc: 0, first: 0, last: 0 },
      records: [],
    };
    expect(formatSearchResults(empty, "zzz", 0, "PittCat")).toContain(
      'No results found for "zzz".',
    );
  });
});

describe("formatRecordDetail", () => {
  it("renders labelled fields and truncates long descriptions", () => {
    const r = rec({
      recordId: "r1",
      title: "A Book",
      resourceType: "book",
      creators: ["Author, An"],
      creationDate: "2019",
      publisher: "Uni Press",
      language: "eng",
      isbn: ["9780123456789"],
      subjects: ["Topic A", "Topic B"],
      description: "x".repeat(600),
    });
    const out = formatRecordDetail(r, "PittCat");
    expect(out).toContain("Title: A Book");
    expect(out).toContain("Type: Book");
    expect(out).toContain("Publisher: Uni Press");
    expect(out).toContain("ISBN: 9780123456789");
    expect(out).toContain("Subjects: Topic A; Topic B");
    expect(out).toContain("Peer-reviewed: No");
    expect(out).toContain("...");
    expect(out).toContain("Availability: Check availability in PittCat");
    expect(out).toContain("Record ID: r1");
  });
});

describe("formatRecordDetail holdings", () => {
  it("lists physical holdings when present", () => {
    const r = rec({
      recordId: "alma993490",
      title: "Diseases of the Heart",
      resourceType: "book",
      creators: ["Bramwell, Byrom"],
      creationDate: "1884",
      holdings: [
        {
          library: "Falk Library",
          libraryCode: "HSLS",
          location: "Rare Books (Non Circulating)",
          callNumber: "RC681 B815d 1884",
          availabilityStatus: "available",
        },
      ],
    });
    const out = formatRecordDetail(r, "PittCat");
    expect(out).toContain("Holdings:");
    expect(out).toContain(
      "  - Falk Library | RC681 B815d 1884 | Rare Books (Non Circulating) | available",
    );
  });

  it("omits the holdings block when there are none", () => {
    const r = rec({ recordId: "r", title: "T", resourceType: "book" });
    expect(formatRecordDetail(r, "PittCat")).not.toContain("Holdings:");
  });
});

describe("formatSuggestions", () => {
  it("lists suggestions", () => {
    expect(formatSuggestions(["a", "b"], "x")).toContain("  - a");
  });
  it("handles none", () => {
    expect(formatSuggestions([], "x")).toBe('No suggestions found for "x".');
  });
});
