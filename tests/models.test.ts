import { describe, it, expect } from "vitest";
import {
  recordFromApiDoc,
  searchResponseFromApi,
  toList,
  firstOrEmpty,
  stripSubfields,
} from "../src/models.js";

describe("normalisers", () => {
  it("toList handles string, array, and null/undefined", () => {
    expect(toList("x")).toEqual(["x"]);
    expect(toList(["a", "b"])).toEqual(["a", "b"]);
    expect(toList(null)).toEqual([]);
    expect(toList(undefined)).toEqual([]);
  });

  it("firstOrEmpty returns the first item or an empty string", () => {
    expect(firstOrEmpty(["a", "b"])).toBe("a");
    expect(firstOrEmpty("solo")).toBe("solo");
    expect(firstOrEmpty(null)).toBe("");
  });
});

describe("recordFromApiDoc", () => {
  const doc = {
    context: "PC",
    pnx: {
      control: {
        recordid: ["cdi_crossref_primary_10_1234"],
        sourcesystem: ["Crossref"],
        sourceid: "crossref",
        score: ["12.5"],
      },
      display: {
        title: "A Study of Things",
        type: "article",
        language: "eng",
        creator: ["Smith, Jane A; Doe, John"],
        subject: ["Machine learning; Entrepreneurship"],
        identifier: ["ISBN 9780123456789", "DOI: 10.1234/abcd"],
        lds50: ["peer_reviewed"],
        creationdate: "2021",
      },
      addata: {
        jtitle: "Journal of Things",
        volume: "12",
        issue: "3",
        spage: "45",
        epage: "67",
        au: ["Smith, Jane A", "Doe, John"],
        issn: "1234-5678",
        abstract: "An abstract.",
      },
      delivery: { fulltext: "fulltext_linktorsrc", delcategory: "Alma-P" },
    },
  };

  const r = recordFromApiDoc(doc);

  it("extracts identity and display fields", () => {
    expect(r.recordId).toBe("cdi_crossref_primary_10_1234");
    expect(r.sourceSystem).toBe("Crossref");
    expect(r.sourceId).toBe("crossref");
    expect(r.title).toBe("A Study of Things");
    expect(r.resourceType).toBe("article");
    expect(r.context).toBe("PC");
  });

  it("splits semicolon-separated creators and subjects", () => {
    expect(r.creators).toEqual(["Smith, Jane A", "Doe, John"]);
    expect(r.subjects).toEqual(["Machine learning", "Entrepreneurship"]);
  });

  it("extracts DOI from the identifier list and keeps all identifiers", () => {
    expect(r.doi).toBe("10.1234/abcd");
    expect(r.identifiers).toEqual(["ISBN 9780123456789", "DOI: 10.1234/abcd"]);
  });

  it("detects peer review and parses the numeric score", () => {
    expect(r.peerReviewed).toBe(true);
    expect(r.score).toBe(12.5);
  });

  it("reads academic data from addata", () => {
    expect(r.journalTitle).toBe("Journal of Things");
    expect(r.volume).toBe("12");
    expect(r.startPage).toBe("45");
    expect(r.endPage).toBe("67");
    expect(r.issn).toEqual(["1234-5678"]);
    expect(r.authorsStructured).toEqual(["Smith, Jane A", "Doe, John"]);
  });

  it("flags full text and reads the year", () => {
    expect(r.fulltextAvailable).toBe(true);
    expect(r.creationDate).toBe("2021");
  });

  it("falls back to addata.date and addata.abstract when display is absent", () => {
    const r2 = recordFromApiDoc({
      pnx: { addata: { date: "2019", abstract: "Fallback abstract." } },
    });
    expect(r2.creationDate).toBe("2019");
    expect(r2.description).toBe("Fallback abstract.");
  });

  it("returns safe defaults for an empty document", () => {
    const empty = recordFromApiDoc({});
    expect(empty.title).toBe("");
    expect(empty.creators).toEqual([]);
    expect(empty.peerReviewed).toBe(false);
    expect(empty.score).toBe(0);
  });
});

describe("searchResponseFromApi", () => {
  it("parses info counts and maps docs to records", () => {
    const data = {
      info: {
        total: 42,
        totalResultsLocal: 10,
        totalResultsPC: 32,
        first: 1,
        last: 10,
      },
      docs: [
        { pnx: { display: { title: "One" } } },
        { pnx: { display: { title: "Two" } } },
      ],
    };
    const resp = searchResponseFromApi(data);
    expect(resp.info.total).toBe(42);
    expect(resp.info.totalPc).toBe(32);
    expect(resp.records.length).toBe(2);
    expect(resp.records[0].title).toBe("One");
  });

  it("handles a missing docs array", () => {
    const resp = searchResponseFromApi({ info: {} });
    expect(resp.records).toEqual([]);
    expect(resp.info.total).toBe(0);
  });
});

describe("stripSubfields (Alma $$ subfield strip)", () => {
  it("keeps the text before the first $$ delimiter", () => {
    expect(
      stripSubfields("Heggie, Jake, 1961- composer.$$QHeggie, Jake"),
    ).toBe("Heggie, Jake, 1961- composer.");
  });

  it("passes values without a delimiter through unchanged (trimmed)", () => {
    expect(stripSubfields("Cushing, Harvey, 1869-1939.")).toBe(
      "Cushing, Harvey, 1869-1939.",
    );
    expect(stripSubfields("  spaced  ")).toBe("spaced");
  });

  it("falls back to the first subfield when a value leads with a delimiter", () => {
    expect(stripSubfields("$$QHeggie, Jake")).toBe("Heggie, Jake");
  });

  it("keeps only the primary form when several subfields follow", () => {
    expect(stripSubfields("Primary$$QAlt$$YOther")).toBe("Primary");
  });
});

describe("recordFromApiDoc: Alma $$ subfield handling", () => {
  const almaDoc = {
    context: "L",
    pnx: {
      control: { recordid: ["alma991001"], sourcesystem: ["Alma"] },
      display: {
        title: "Meningiomas$$QMeningiomas, their classification",
        creator: ["Cushing, Harvey, 1869-1939.$$QCushing, Harvey"],
        contributor: ["Eisenhardt, Louise.$$QEisenhardt, Louise"],
        subject: ["Meningioma$$QMeningiomas; Brain$$QBrain neoplasms"],
        publisher: "Charles C. Thomas$$QThomas",
      },
    },
  };
  const ar = recordFromApiDoc(almaDoc);

  it("strips $$ subfields from title, creator, contributor, subject, publisher", () => {
    expect(ar.title).toBe("Meningiomas");
    expect(ar.creators).toEqual(["Cushing, Harvey, 1869-1939."]);
    expect(ar.contributors).toEqual(["Eisenhardt, Louise."]);
    expect(ar.subjects).toEqual(["Meningioma", "Brain"]);
    expect(ar.publisher).toBe("Charles C. Thomas");
  });

  it("preserves multiple $$-carrying names split on a semicolon", () => {
    const multi = recordFromApiDoc({
      pnx: {
        display: {
          creator: ["Cushing, Harvey.$$QCushing; Osler, William.$$QOsler"],
        },
      },
    });
    expect(multi.creators).toEqual(["Cushing, Harvey.", "Osler, William."]);
  });
});
