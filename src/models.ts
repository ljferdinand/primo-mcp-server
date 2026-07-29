/**
 * Data model + PNX parsing for the Primo MCP server (Node port).
 *
 * Primo's API returns inconsistent field shapes: the same field may be a
 * string, an array of strings, or missing entirely. These normalisers collapse
 * everything into predictable types, mirroring the Python models.py.
 */

/** A value of unknown shape coming from the Primo JSON response. */
type Json = unknown;
type RawObject = Record<string, Json>;

function asObject(value: Json): RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RawObject)
    : {};
}

/** Normalise a field that may be string | string[] | null/undefined into string[]. */
export function toList(value: Json): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [];
}

/** First element of a normalised list, or empty string. */
export function firstOrEmpty(value: Json): string {
  const items = toList(value);
  return items.length > 0 ? items[0] : "";
}

function toNumber(value: Json, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Split each string in a list on ';' and return trimmed, non-empty parts. */
function splitSemicolons(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    for (const part of value.split(";")) {
      const trimmed = part.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

export interface PrimoRecord {
  // Identity
  recordId: string;
  sourceId: string;
  sourceSystem: string;

  // Display
  title: string;
  resourceType: string;
  language: string;
  creators: string[];
  contributors: string[];
  publisher: string;
  creationDate: string;
  sourceLabel: string;
  description: string;
  snippet: string;
  subjects: string[];
  keywords: string[];
  isPartOf: string;

  // Identifiers
  identifiers: string[];
  doi: string;
  isbn: string[];
  issn: string[];

  // Academic data
  journalTitle: string;
  volume: string;
  issue: string;
  startPage: string;
  endPage: string;
  peerReviewed: boolean;
  risType: string;
  authorsStructured: string[];

  // Availability
  fulltextAvailable: boolean;
  deliveryCategory: string;

  // Relevance
  score: number;
  context: string;
}

export interface SearchInfo {
  total: number;
  totalLocal: number;
  totalPc: number;
  first: number;
  last: number;
}

export interface SearchResponse {
  info: SearchInfo;
  records: PrimoRecord[];
}

/** Parse a single document from the Primo /pnxs response. */
export function recordFromApiDoc(doc: Json): PrimoRecord {
  const docObj = asObject(doc);
  const pnx = asObject(docObj.pnx);
  const display = asObject(pnx.display);
  const control = asObject(pnx.control);
  const addata = asObject(pnx.addata);
  const delivery = asObject(pnx.delivery);

  // DOI from identifiers: case-insensitive presence check, then split on the
  // literal "DOI:" (matches the Python; the raw identifier's own delimiters are
  // not stripped -- flagged for the parity-vs-cleanup follow-up).
  const identifiers = toList(display.identifier);
  let doi = "";
  for (const ident of identifiers) {
    if (ident.toUpperCase().includes("DOI:")) {
      const parts = ident.split("DOI:");
      doi = parts[parts.length - 1].trim();
      break;
    }
  }

  const creators = splitSemicolons(toList(display.creator));
  const subjects = splitSemicolons(toList(display.subject));
  const keywords = splitSemicolons(toList(display.keyword));

  const peerReviewed = toList(display.lds50).some((x) =>
    x.toLowerCase().includes("peer_review"),
  );

  const scoreList = toList(control.score);
  const score = scoreList.length > 0 ? toNumber(scoreList[0], 0) : 0;

  const contextValue = docObj.context;
  const context = typeof contextValue === "string" ? contextValue : "";

  return {
    recordId: firstOrEmpty(control.recordid),
    // Python had a redundant fallback expression here; behaviour is identical
    // to firstOrEmpty(control.sourceid), so keep it clean.
    sourceId: firstOrEmpty(control.sourceid),
    sourceSystem: firstOrEmpty(control.sourcesystem),

    title: firstOrEmpty(display.title),
    resourceType: firstOrEmpty(display.type),
    language: firstOrEmpty(display.language),
    creators,
    contributors: toList(display.contributor),
    publisher: firstOrEmpty(display.publisher),
    creationDate: firstOrEmpty(display.creationdate) || firstOrEmpty(addata.date),
    sourceLabel: firstOrEmpty(display.source),
    description:
      firstOrEmpty(display.description) || firstOrEmpty(addata.abstract),
    snippet: firstOrEmpty(display.snippet),
    subjects,
    keywords,
    isPartOf: firstOrEmpty(display.ispartof),

    identifiers,
    doi,
    isbn: toList(addata.isbn),
    issn: toList(addata.issn),

    journalTitle: firstOrEmpty(addata.jtitle),
    volume: firstOrEmpty(addata.volume),
    issue: firstOrEmpty(addata.issue),
    startPage: firstOrEmpty(addata.spage),
    endPage: firstOrEmpty(addata.epage),
    peerReviewed,
    risType: firstOrEmpty(addata.ristype),
    authorsStructured: toList(addata.au),

    fulltextAvailable: String(delivery.fulltext ?? "").includes("fulltext"),
    deliveryCategory: firstOrEmpty(delivery.delcategory),

    score,
    context,
  };
}

/** Parse the full /pnxs search response. */
export function searchResponseFromApi(data: Json): SearchResponse {
  const dataObj = asObject(data);
  const infoRaw = asObject(dataObj.info);
  const info: SearchInfo = {
    total: toNumber(infoRaw.total, 0),
    totalLocal: toNumber(infoRaw.totalResultsLocal, 0),
    totalPc: toNumber(infoRaw.totalResultsPC, 0),
    first: toNumber(infoRaw.first, 0),
    last: toNumber(infoRaw.last, 0),
  };
  const docs: Json[] = Array.isArray(dataObj.docs) ? dataObj.docs : [];
  const records = docs.map((doc) => recordFromApiDoc(doc));
  return { info, records };
}
