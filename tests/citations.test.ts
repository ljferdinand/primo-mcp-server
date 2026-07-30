import { describe, it, expect } from "vitest";
import type { PrimoRecord } from "../src/models.js";
import { formatCitation, CITATION_STYLES } from "../src/citations.js";

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
    publisherPlace: "",
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
});

const book = rec({
  resourceType: "book",
  creators: ["Author, Ann Beth"],
  creationDate: "2019",
  title: "A Book",
  publisher: "Uni Press",
});

const bookWithPlace = rec({
  resourceType: "book",
  creators: ["Bramwell, Byrom"],
  creationDate: "1884",
  title: "Diseases of the Heart",
  publisher: "Appleton & Co.",
  publisherPlace: "New York",
});

describe("formatCitation - exact style output (parity)", () => {
  it("APA 7 article", () => {
    expect(formatCitation(article, "apa7")).toBe(
      "Smith, J. A. & Doe, J. (2021). Deep Learning. *Journal of AI*, *12*(3), 45-67. https://doi.org/10.1/x",
    );
  });

  it("Harvard article", () => {
    expect(formatCitation(article, "harvard")).toBe(
      "Smith, J. A. & Doe, J. (2021) 'Deep Learning', *Journal of AI*, vol. 12, no. 3, pp. 45-67. https://doi.org/10.1/x",
    );
  });

  it("Chicago article (terminal period de-duplicated after the author initial)", () => {
    expect(formatCitation(article, "chicago")).toBe(
      'Smith, J. A., and Doe, J. "Deep Learning." *Journal of AI* 12, no. 3 (2021): 45-67. https://doi.org/10.1/x',
    );
  });

  it("IEEE article (two authors joined with 'and', no serial comma)", () => {
    expect(formatCitation(article, "ieee")).toBe(
      'J. A. Smith and J. Doe, "Deep Learning," *Journal of AI*, vol. 12, no. 3, pp. 45-67, 2021. doi: 10.1/x.',
    );
  });

  it("Vancouver article", () => {
    expect(formatCitation(article, "vancouver")).toBe(
      "Smith JA, Doe J. Deep Learning. Journal of AI. 2021;12(3):45-67. doi:10.1/x",
    );
  });

  it("APA 7 book", () => {
    expect(formatCitation(book, "apa7")).toBe(
      "Author, A. B. (2019). *A Book*. Uni Press.",
    );
  });
});

describe("book place of publication (per-style)", () => {
  // Place of publication is kept for Chicago, IEEE, and Vancouver and dropped
  // for APA 7 and Cite Them Right Harvard (13th ed.). Terminal periods are
  // de-duplicated, so a publisher ending in "Co." does not gain a second dot
  // and a Chicago author initial is not doubled.
  it("APA 7 drops the place of publication", () => {
    expect(formatCitation(bookWithPlace, "apa7")).toBe(
      "Bramwell, B. (1884). *Diseases of the Heart*. Appleton & Co.",
    );
  });

  it("Harvard (Cite Them Right 13th ed.) drops the place of publication", () => {
    expect(formatCitation(bookWithPlace, "harvard")).toBe(
      "Bramwell, B. (1884) *Diseases of the Heart*, Appleton & Co.",
    );
  });

  it("Chicago keeps place as 'Place: Publisher'", () => {
    expect(formatCitation(bookWithPlace, "chicago")).toBe(
      "Bramwell, B. *Diseases of the Heart*. New York: Appleton & Co., 1884.",
    );
  });

  it("IEEE keeps place as 'City: Publisher'", () => {
    expect(formatCitation(bookWithPlace, "ieee")).toBe(
      "B. Bramwell, *Diseases of the Heart*. New York: Appleton & Co., 1884.",
    );
  });

  it("Vancouver keeps place as 'Place: Publisher'", () => {
    expect(formatCitation(bookWithPlace, "vancouver")).toBe(
      "Bramwell B. Diseases of the Heart. New York: Appleton & Co.; 1884.",
    );
  });

  it("falls back to publisher-only when no place is present", () => {
    const noPlace = rec({
      resourceType: "book",
      creators: ["Bramwell, Byrom"],
      creationDate: "1884",
      title: "Diseases of the Heart",
      publisher: "Appleton & Co.",
    });
    expect(formatCitation(noPlace, "chicago")).toBe(
      "Bramwell, B. *Diseases of the Heart*. Appleton & Co., 1884.",
    );
  });
});

describe("terminal-period de-duplication", () => {
  it("does not double a publisher already ending in a period (APA)", () => {
    const r = rec({
      resourceType: "book",
      creators: ["Doe, Jane"],
      creationDate: "2020",
      title: "T",
      publisher: "Random House, Inc.",
    });
    expect(formatCitation(r, "apa7")).toBe(
      "Doe, J. (2020). *T*. Random House, Inc.",
    );
  });

  it("still adds a period to a publisher that lacks one (APA)", () => {
    const r = rec({
      resourceType: "book",
      creators: ["Doe, Jane"],
      creationDate: "2020",
      title: "T",
      publisher: "Uni Press",
    });
    expect(formatCitation(r, "apa7")).toBe("Doe, J. (2020). *T*. Uni Press.");
  });
});

describe("author-count rules", () => {
  it("APA joins three authors with an Oxford '& '", () => {
    const r = rec({
      resourceType: "book",
      title: "T",
      creationDate: "2020",
      creators: ["A, X", "B, Y", "C, Z"],
    });
    expect(formatCitation(r, "apa7")).toContain("A, X., B, Y., & C, Z.");
  });

  it("Chicago collapses four or more authors to 'et al.'", () => {
    const r = rec({
      resourceType: "article",
      title: "T",
      creationDate: "2020",
      creators: ["A, X", "B, Y", "C, Z", "D, W"],
    });
    expect(formatCitation(r, "chicago")).toContain("A, X. et al.");
  });

  it("Vancouver collapses seven or more authors to 'et al'", () => {
    const r = rec({
      resourceType: "article",
      title: "T",
      creationDate: "2020",
      creators: ["A, X", "B, Y", "C, Z", "D, W", "E, V", "F, U", "G, T"],
    });
    expect(formatCitation(r, "vancouver")).toContain(", et al");
  });
});

describe("IEEE author count (six-author reference-list rule)", () => {
  it("joins two authors with 'and' and no serial comma", () => {
    const two = rec({
      resourceType: "article",
      title: "T",
      creationDate: "2020",
      journalTitle: "J",
      creators: ["A, X", "B, Y"],
    });
    expect(formatCitation(two, "ieee")).toContain("X. A and Y. B");
  });

  it("lists all six authors with a serial comma before the final 'and'", () => {
    const six = rec({
      resourceType: "article",
      title: "T",
      creationDate: "2020",
      journalTitle: "J",
      creators: ["A, X", "B, Y", "C, Z", "D, W", "E, V", "F, U"],
    });
    expect(formatCitation(six, "ieee")).toContain(
      "X. A, Y. B, Z. C, W. D, V. E, and U. F",
    );
    expect(formatCitation(six, "ieee")).not.toContain("et al.");
  });

  it("collapses seven or more authors to the first author + 'et al.'", () => {
    const seven = rec({
      resourceType: "article",
      title: "T",
      creationDate: "2020",
      journalTitle: "J",
      creators: ["A, X", "B, Y", "C, Z", "D, W", "E, V", "F, U", "G, T"],
    });
    expect(formatCitation(seven, "ieee")).toContain("X. A et al.");
  });
});

describe("authors with no given name", () => {
  it("omits the initials and the trailing comma (no stray dot)", () => {
    const r = rec({
      resourceType: "book",
      title: "T",
      creationDate: "2020",
      creators: ["Smith,"],
    });
    expect(formatCitation(r, "apa7")).toBe("Smith (2020). *T*.");
  });
});

describe("format selection and defaults", () => {
  it("treats non-article types as books", () => {
    const r = rec({
      resourceType: "dissertation",
      title: "Thesis",
      creationDate: "2018",
      creators: ["Grad, Student"],
      publisher: "Some Uni",
    });
    // Book APA italicises the title.
    expect(formatCitation(r, "apa7")).toContain("*Thesis*");
  });

  it("prefers authorsStructured over creators when present", () => {
    const r = rec({
      resourceType: "book",
      title: "T",
      creationDate: "2020",
      creators: ["Wrong, One"],
      authorsStructured: ["Right, Two"],
    });
    expect(formatCitation(r, "apa7")).toContain("Right, T.");
  });

  it("exposes the five supported styles", () => {
    expect([...CITATION_STYLES]).toEqual([
      "apa7",
      "harvard",
      "chicago",
      "ieee",
      "vancouver",
    ]);
  });
});
