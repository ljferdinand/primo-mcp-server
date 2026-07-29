/**
 * Export Primo records to BibTeX, RIS, and CSV (port of exporters.py).
 *
 * CSV uses a small RFC-4180 quoter (fields containing a comma, quote, or
 * newline are double-quoted, embedded quotes doubled) plus a UTF-8 BOM and
 * CRLF line endings for Excel, rather than a naive join or an added dependency.
 */
import type { PrimoRecord } from "./models.js";

function authorsOf(record: PrimoRecord): string[] {
  return record.authorsStructured.length > 0
    ? record.authorsStructured
    : record.creators;
}

function bibtexKey(record: PrimoRecord): string {
  let firstAuthor = "";
  const authors = authorsOf(record);
  if (authors.length > 0) {
    const idx = authors[0].indexOf(",");
    const lastName = idx === -1 ? authors[0] : authors[0].slice(0, idx);
    firstAuthor = lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  const year = record.creationDate ? record.creationDate.slice(0, 4) : "nodate";
  let titleWord = "";
  if (record.title) {
    const words = record.title.match(/[a-zA-Z]+/g);
    if (words && words.length > 0) titleWord = words[0].toLowerCase();
  }
  return `${firstAuthor}${year}${titleWord}` || "unknown";
}

function bibtexEscape(value: string): string {
  return value.replace(/&/g, "\\&").replace(/%/g, "\\%").replace(/#/g, "\\#");
}

export function exportBibtex(records: PrimoRecord[]): string {
  const entries: string[] = [];
  const usedKeys = new Set<string>();

  for (const record of records) {
    const rtype = record.resourceType.toLowerCase();
    let entryType: string;
    if (rtype === "article" || rtype === "review") entryType = "article";
    else if (rtype === "conference_proceeding") entryType = "inproceedings";
    else if (rtype === "dissertation" || rtype === "thesis") entryType = "phdthesis";
    else entryType = "book";

    let key = bibtexKey(record);
    if (usedKeys.has(key)) {
      let i = 2;
      while (usedKeys.has(`${key}${String.fromCharCode(96 + i)}`)) i += 1;
      key = `${key}${String.fromCharCode(96 + i)}`;
    }
    usedKeys.add(key);

    const fields: string[] = [];
    const authors = authorsOf(record);
    if (authors.length > 0) {
      fields.push(`  author = {${bibtexEscape(authors.join(" and "))}}`);
    }
    fields.push(`  title = {${bibtexEscape(record.title)}}`);

    const year = record.creationDate ? record.creationDate.slice(0, 4) : "";
    if (year) fields.push(`  year = {${year}}`);

    if (record.journalTitle && entryType === "article") {
      fields.push(`  journal = {${bibtexEscape(record.journalTitle)}}`);
    }
    if (record.volume) fields.push(`  volume = {${record.volume}}`);
    if (record.issue) fields.push(`  number = {${record.issue}}`);
    if (record.startPage) {
      let pages = record.startPage;
      if (record.endPage) pages += `--${record.endPage}`;
      fields.push(`  pages = {${pages}}`);
    }
    if (record.publisher) {
      fields.push(`  publisher = {${bibtexEscape(record.publisher)}}`);
    }
    if (record.doi) fields.push(`  doi = {${record.doi}}`);
    if (record.isbn.length > 0) fields.push(`  isbn = {${record.isbn[0]}}`);
    if (record.issn.length > 0) fields.push(`  issn = {${record.issn[0]}}`);

    entries.push(`@${entryType}{${key},\n` + fields.join(",\n") + "\n}");
  }

  return entries.join("\n\n");
}

export function exportRis(records: PrimoRecord[]): string {
  const risTypeMap: Record<string, string> = {
    article: "JOUR",
    review: "JOUR",
    book: "BOOK",
    journal: "JFULL",
    conference_proceeding: "CONF",
    dissertation: "THES",
    newspaper_article: "NEWS",
  };
  const entries: string[] = [];

  for (const record of records) {
    const lines: string[] = [];
    const rtype = record.resourceType.toLowerCase();
    lines.push(`TY  - ${risTypeMap[rtype] ?? "GEN"}`);

    for (const author of authorsOf(record)) lines.push(`AU  - ${author}`);
    lines.push(`TI  - ${record.title}`);

    if (record.journalTitle) {
      lines.push(`JO  - ${record.journalTitle}`);
      lines.push(`T2  - ${record.journalTitle}`);
    }

    const year = record.creationDate ? record.creationDate.slice(0, 4) : "";
    if (year) {
      lines.push(`PY  - ${year}`);
      lines.push(`DA  - ${record.creationDate}`);
    }

    if (record.volume) lines.push(`VL  - ${record.volume}`);
    if (record.issue) lines.push(`IS  - ${record.issue}`);
    if (record.startPage) lines.push(`SP  - ${record.startPage}`);
    if (record.endPage) lines.push(`EP  - ${record.endPage}`);
    if (record.publisher) lines.push(`PB  - ${record.publisher}`);
    if (record.doi) lines.push(`DO  - ${record.doi}`);
    if (record.isbn.length > 0) lines.push(`SN  - ${record.isbn[0]}`);
    else if (record.issn.length > 0) lines.push(`SN  - ${record.issn[0]}`);
    if (record.description) lines.push(`AB  - ${record.description}`);
    for (const subject of record.subjects) lines.push(`KW  - ${subject}`);
    if (record.language) lines.push(`LA  - ${record.language}`);
    lines.push("ER  - ");

    entries.push(lines.join("\n"));
  }

  return entries.join("\n\n");
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

export function exportCsv(records: PrimoRecord[]): string {
  const rows: string[] = [];
  rows.push(
    csvRow([
      "Record ID",
      "Title",
      "Authors",
      "Year",
      "Type",
      "Journal",
      "Volume",
      "Issue",
      "Pages",
      "DOI",
      "ISBN",
      "ISSN",
      "Publisher",
      "Subjects",
      "Peer-Reviewed",
      "Language",
    ]),
  );

  for (const record of records) {
    const year = record.creationDate ? record.creationDate.slice(0, 4) : "";
    let pages = record.startPage;
    if (pages && record.endPage) pages += `-${record.endPage}`;

    rows.push(
      csvRow([
        record.recordId,
        record.title,
        authorsOf(record).join("; "),
        year,
        record.resourceType,
        record.journalTitle,
        record.volume,
        record.issue,
        pages || "",
        record.doi,
        record.isbn.join("; "),
        record.issn.join("; "),
        record.publisher,
        record.subjects.join("; "),
        record.peerReviewed ? "Yes" : "No",
        record.language,
      ]),
    );
  }

  // UTF-8 BOM for Excel; CRLF terminators including a trailing one (matches the
  // Python csv.writer default).
  return "\ufeff" + rows.join("\r\n") + "\r\n";
}
