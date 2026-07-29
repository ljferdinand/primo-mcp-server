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

/**
 * Strip Primo "$$"-delimited subfields from an Alma PNX display value.
 *
 * Pitt (and other Alma) local records return authority-controlled display
 * fields carrying subfield delimiters, e.g.
 *   "Heggie, Jake, 1961- composer.$$QHeggie, Jake"
 * where the primary display form precedes the first "$$" and an alternate
 * form follows it. Keep the text before the first "$$". If a value leads with
 * a delimiter (no primary form), fall back to the first subfield's text with
 * its single-character code removed. Values without "$$" pass through
 * unchanged. Deliberate deviation from strict Python parity (institution-first
 * quirk fix), scoped to the display fields where the quirk appears.
 */
export function stripSubfields(value: string): string {
  const idx = value.indexOf("$$");
  if (idx === -1) return value.trim();
  const before = value.slice(0, idx).trim();
  if (before) return before;
  // Leading delimiter: take the first subfield segment, drop its code char.
  const rest = value.slice(idx + 2);
  const nextDelim = rest.indexOf("$$");
  const firstField = nextDelim === -1 ? rest : rest.slice(0, nextDelim);
  return firstField.replace(/^[A-Za-z0-9]/, "").trim();
}

/** A physical holding: which library holds an item, where, and its status. */
export interface Holding {
  /** Owning library, e.g. "Falk Library" (PNX delivery.holding[].mainLocation). */
  library: string;
  /** Library code, e.g. "HSLS". */
  libraryCode: string;
  /** Shelf location, e.g. "Rare Books (Non Circulating)". */
  location: string;
  /** Call number, e.g. "RC681 B815d 1884". */
  callNumber: string;
  /** Availability status, e.g. "available". */
  availabilityStatus: string;
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
  /** Place of publication, split from the publisher; empty when unknown. */
  publisherPlace?: string;
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
  /**
   * Physical holdings (owning library, location, call number, status).
   * Populated from the direct get_record response; usually empty for records
   * that come from a brief search, whose delivery block is lighter.
   */
  holdings?: Holding[];

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

  // DOI from identifiers: split on the literal "DOI:" prefix case-insensitively
  // (records may carry it lower-case, e.g. "doi:10..."), take the text after it,
  // and strip any trailing Primo "$$" subfield delimiters, the same quirk
  // handled for the display fields.
  const identifiers = toList(display.identifier);
  let doi = "";
  for (const ident of identifiers) {
    const parts = ident.split(/doi:/i);
    if (parts.length > 1) {
      doi = stripSubfields(parts[parts.length - 1]);
      break;
    }
  }

  const creators = splitSemicolons(toList(display.creator))
    .map(stripSubfields)
    .filter((s) => s.length > 0);
  const subjects = splitSemicolons(toList(display.subject))
    .map(stripSubfields)
    .filter((s) => s.length > 0);
  const keywords = splitSemicolons(toList(display.keyword))
    .map(stripSubfields)
    .filter((s) => s.length > 0);

  // Publisher and place of publication. Alma addata carries clean, pre-split
  // fields (pub = publisher, cop = place); prefer them. Otherwise fall back to
  // the combined display.publisher, which uses the ISBD " : " delimiter between
  // place and publisher (e.g. "New York : Appleton & Co."). $$ subfields are
  // stripped first, as for the other display fields. The date is kept in
  // creationDate; no attempt is made to strip a trailing date from the string.
  const addataPublisher = stripSubfields(firstOrEmpty(addata.pub));
  const addataPlace = stripSubfields(firstOrEmpty(addata.cop));
  let publisher: string;
  let publisherPlace: string;
  if (addataPublisher) {
    publisher = addataPublisher;
    publisherPlace = addataPlace;
  } else {
    const combined = stripSubfields(firstOrEmpty(display.publisher));
    const sep = combined.indexOf(" : ");
    if (sep !== -1) {
      publisherPlace = combined.slice(0, sep).trim();
      publisher = combined.slice(sep + 3).trim();
    } else {
      publisher = combined;
      publisherPlace = addataPlace;
    }
  }

  // Physical holdings (owning library, location, call number, status). The
  // direct get_record response carries these under delivery.holding[] (moved
  // into pnx.delivery by the client); brief search results carry a lighter
  // delivery block, so this is usually empty for search results. The nested
  // fields are plain strings in the PNX.
  const holdingList: Json[] = Array.isArray(delivery.holding)
    ? delivery.holding
    : [];
  const holdings: Holding[] = holdingList
    .map(asObject)
    .map((h) => ({
      library: firstOrEmpty(h.mainLocation),
      libraryCode: firstOrEmpty(h.libraryCode),
      location: firstOrEmpty(h.subLocation),
      callNumber: firstOrEmpty(h.callNumber),
      availabilityStatus: firstOrEmpty(h.availabilityStatus),
    }))
    .filter(
      (h) => h.library !== "" || h.libraryCode !== "" || h.callNumber !== "",
    );

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

    title: stripSubfields(firstOrEmpty(display.title)),
    resourceType: firstOrEmpty(display.type),
    language: firstOrEmpty(display.language),
    creators,
    contributors: toList(display.contributor)
      .map(stripSubfields)
      .filter((s) => s.length > 0),
    publisher,
    publisherPlace,
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

    fulltextAvailable: toList(delivery.fulltext).some((v) => {
      const s = v.toLowerCase();
      return s.includes("fulltext") && !s.includes("no_fulltext");
    }),
    deliveryCategory: firstOrEmpty(delivery.delcategory),
    holdings,

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
