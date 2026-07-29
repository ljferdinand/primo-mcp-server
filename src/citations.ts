/**
 * Citation formatting for Primo records (port of citations.py).
 * Supports APA 7th, Harvard, Chicago, IEEE, and Vancouver.
 *
 * Ported from the Python for behavioural parity, with one deliberate
 * deviation: the terminal-period doubling the Python produced (an author
 * initial's trailing dot sitting next to the style's own period, or a
 * publisher ending in "Co.") is de-duplicated here via terminalPeriod.
 */
import type { PrimoRecord } from "./models.js";

export const CITATION_STYLES = [
  "apa7",
  "harvard",
  "chicago",
  "ieee",
  "vancouver",
] as const;
export type CitationStyle = (typeof CITATION_STYLES)[number];

function authorsFor(record: PrimoRecord): string[] {
  return record.authorsStructured.length > 0
    ? record.authorsStructured
    : record.creators;
}

function stripTrailingDots(value: string): string {
  return value.replace(/\.+$/, "");
}

function yearOf(record: PrimoRecord): string {
  return record.creationDate ? record.creationDate.slice(0, 4) : "n.d.";
}

/**
 * "Place: Publisher" when a place of publication is present, else the
 * publisher alone. Used by the styles that retain place (Chicago, IEEE,
 * Vancouver); APA 7 and Cite Them Right Harvard (13th ed.) omit place and use
 * the plain publisher.
 */
function publisherWithPlace(record: PrimoRecord): string {
  return record.publisherPlace
    ? `${record.publisherPlace}: ${record.publisher}`
    : record.publisher;
}

/** Append a terminal period unless the string already ends with one. */
function terminalPeriod(value: string): string {
  return /\.$/.test(value) ? value : `${value}.`;
}

/** First-name words -> spaced initials with dots, e.g. "Jane Anne" -> "J. A." */
function initialsDotted(first: string): string {
  const words = first.split(/\s+/).filter((w) => w.length > 0);
  return words.map((w) => w[0].toUpperCase()).join(". ") + ".";
}

/** "Last, First" -> "Last, F. M."; unchanged if there is no comma. */
function authorsLastInitials(creators: string[]): string[] {
  return creators.map((c) => {
    const idx = c.indexOf(",");
    if (idx === -1) return c.trim();
    const last = c.slice(0, idx).trim();
    const first = c.slice(idx + 1).trim();
    return `${last}, ${initialsDotted(first)}`;
  });
}

function authorsApa(creators: string[]): string {
  const f = authorsLastInitials(creators);
  if (f.length === 0) return "Unknown author";
  if (f.length === 1) return f[0];
  if (f.length === 2) return `${f[0]} & ${f[1]}`;
  if (f.length <= 20) return f.slice(0, -1).join(", ") + ", & " + f[f.length - 1];
  return f.slice(0, 19).join(", ") + ", ... " + f[f.length - 1];
}

function authorsChicago(creators: string[]): string {
  const f = authorsLastInitials(creators);
  if (f.length === 0) return "Unknown author";
  if (f.length === 1) return f[0];
  if (f.length <= 3) return f.slice(0, -1).join(", ") + ", and " + f[f.length - 1];
  return f[0] + " et al.";
}

/** IEEE author list: "F. M. Last". */
function authorsIeee(creators: string[]): string[] {
  return creators.map((c) => {
    const idx = c.indexOf(",");
    if (idx === -1) return c.trim();
    const last = c.slice(0, idx).trim();
    const first = c.slice(idx + 1).trim();
    return `${initialsDotted(first)} ${last}`;
  });
}

function authorsVancouver(creators: string[]): string {
  const f = creators.map((c) => {
    const idx = c.indexOf(",");
    if (idx === -1) return c.trim();
    const last = c.slice(0, idx).trim();
    const first = c.slice(idx + 1).trim();
    const initials = first
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w[0].toUpperCase())
      .join("");
    return `${last} ${initials}`;
  });
  if (f.length === 0) return "Unknown author";
  if (f.length <= 6) return f.join(", ");
  return f.slice(0, 6).join(", ") + ", et al";
}

function citeArticleApa(r: PrimoRecord): string {
  const authors = authorsApa(authorsFor(r));
  const year = yearOf(r);
  const title = stripTrailingDots(r.title);
  const parts: string[] = [`${authors} (${year}). ${title}.`];
  if (r.journalTitle) {
    let volInfo = `*${r.journalTitle}*`;
    if (r.volume) volInfo += `, *${r.volume}*`;
    if (r.issue) volInfo += `(${r.issue})`;
    if (r.startPage) {
      volInfo += `, ${r.startPage}`;
      if (r.endPage) volInfo += `-${r.endPage}`;
    }
    parts.push(`${volInfo}.`);
  }
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  return parts.join(" ");
}

function citeBookApa(r: PrimoRecord): string {
  const authors = authorsApa(authorsFor(r));
  const year = yearOf(r);
  const title = stripTrailingDots(r.title);
  const parts: string[] = [`${authors} (${year}). *${title}*.`];
  if (r.publisher) parts.push(terminalPeriod(r.publisher));
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  return parts.join(" ");
}

function citeArticleHarvard(r: PrimoRecord): string {
  const authors = authorsApa(authorsFor(r));
  const year = yearOf(r);
  const title = stripTrailingDots(r.title);
  const parts: string[] = [`${authors} (${year}) '${title}',`];
  if (r.journalTitle) {
    let volInfo = `*${r.journalTitle}*`;
    if (r.volume) volInfo += `, vol. ${r.volume}`;
    if (r.issue) volInfo += `, no. ${r.issue}`;
    if (r.startPage) {
      volInfo += `, pp. ${r.startPage}`;
      if (r.endPage) volInfo += `-${r.endPage}`;
    }
    parts.push(`${volInfo}.`);
  }
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  return parts.join(" ");
}

function citeBookHarvard(r: PrimoRecord): string {
  const authors = authorsApa(authorsFor(r));
  const year = yearOf(r);
  const title = stripTrailingDots(r.title);
  const parts: string[] = [`${authors} (${year}) *${title}*,`];
  if (r.publisher) parts.push(terminalPeriod(r.publisher));
  return parts.join(" ");
}

function citeArticleChicago(r: PrimoRecord): string {
  const authors = authorsChicago(authorsFor(r));
  const year = yearOf(r);
  const title = stripTrailingDots(r.title);
  const parts: string[] = [`${terminalPeriod(authors)} "${title}."`];
  if (r.journalTitle) {
    let volInfo = `*${r.journalTitle}*`;
    if (r.volume) volInfo += ` ${r.volume}`;
    if (r.issue) volInfo += `, no. ${r.issue}`;
    let segment = `${volInfo} (${year})`;
    if (r.startPage) {
      let pages = r.startPage;
      if (r.endPage) pages += `-${r.endPage}`;
      segment += `: ${pages}`;
    }
    segment += ".";
    parts.push(segment);
  }
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  return parts.join(" ");
}

function citeBookChicago(r: PrimoRecord): string {
  const authors = authorsChicago(authorsFor(r));
  const year = yearOf(r);
  const title = stripTrailingDots(r.title);
  const parts: string[] = [`${terminalPeriod(authors)} *${title}*.`];
  if (r.publisher) parts.push(`${publisherWithPlace(r)}, ${year}.`);
  else parts.push(`${year}.`);
  return parts.join(" ");
}

function citeArticleIeee(r: PrimoRecord): string {
  const list = authorsIeee(authorsFor(r));
  let authors: string;
  if (list.length === 0) authors = "Unknown author";
  else if (list.length <= 3) {
    authors =
      list.length > 1
        ? list.slice(0, -1).join(", ") + ", and " + list[list.length - 1]
        : list[0];
  } else {
    authors = list[0] + " et al.";
  }
  const title = stripTrailingDots(r.title);
  const year = yearOf(r);
  const parts: string[] = [`${authors}, "${title},"`];
  if (r.journalTitle) {
    let volInfo = `*${r.journalTitle}*`;
    if (r.volume) volInfo += `, vol. ${r.volume}`;
    if (r.issue) volInfo += `, no. ${r.issue}`;
    if (r.startPage) {
      volInfo += `, pp. ${r.startPage}`;
      if (r.endPage) volInfo += `-${r.endPage}`;
    }
    parts.push(`${volInfo}, ${year}.`);
  }
  if (r.doi) parts.push(`doi: ${r.doi}.`);
  return parts.join(" ");
}

function citeBookIeee(r: PrimoRecord): string {
  const list = authorsIeee(authorsFor(r));
  let authors: string;
  if (list.length === 0) authors = "Unknown author";
  else {
    authors = list.slice(0, 3).join(", ");
    if (list.length > 3) authors += " et al.";
  }
  const title = stripTrailingDots(r.title);
  const year = yearOf(r);
  const parts: string[] = [`${authors}, *${title}*.`];
  if (r.publisher) parts.push(`${publisherWithPlace(r)}, ${year}.`);
  else parts.push(`${year}.`);
  return parts.join(" ");
}

function citeArticleVancouver(r: PrimoRecord): string {
  const authors = authorsVancouver(authorsFor(r));
  const title = stripTrailingDots(r.title);
  const year = yearOf(r);
  const parts: string[] = [`${authors}. ${title}.`];
  if (r.journalTitle) {
    let volInfo = `${r.journalTitle}. ${year}`;
    if (r.volume) volInfo += `;${r.volume}`;
    if (r.issue) volInfo += `(${r.issue})`;
    if (r.startPage) {
      volInfo += `:${r.startPage}`;
      if (r.endPage) volInfo += `-${r.endPage}`;
    }
    parts.push(`${volInfo}.`);
  }
  if (r.doi) parts.push(`doi:${r.doi}`);
  return parts.join(" ");
}

function citeBookVancouver(r: PrimoRecord): string {
  const authors = authorsVancouver(authorsFor(r));
  const title = stripTrailingDots(r.title);
  const year = yearOf(r);
  const parts: string[] = [`${authors}. ${title}.`];
  if (r.publisher) parts.push(`${publisherWithPlace(r)}; ${year}.`);
  else parts.push(`${year}.`);
  return parts.join(" ");
}

type StyleFuncs = {
  article: (r: PrimoRecord) => string;
  book: (r: PrimoRecord) => string;
};

const STYLE_MAP: Record<string, StyleFuncs> = {
  apa7: { article: citeArticleApa, book: citeBookApa },
  harvard: { article: citeArticleHarvard, book: citeBookHarvard },
  chicago: { article: citeArticleChicago, book: citeBookChicago },
  ieee: { article: citeArticleIeee, book: citeBookIeee },
  vancouver: { article: citeArticleVancouver, book: citeBookVancouver },
};

const ARTICLE_TYPES = new Set(["article", "review", "newspaper_article"]);

export function formatCitation(record: PrimoRecord, style = "apa7"): string {
  const styleFuncs = STYLE_MAP[style] ?? STYLE_MAP.apa7;
  const rtype = record.resourceType.toLowerCase();
  const func = ARTICLE_TYPES.has(rtype) ? styleFuncs.article : styleFuncs.book;
  return func(record);
}
