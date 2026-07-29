/**
 * Citation formatting for Primo records (port of citations.py).
 * Supports APA 7th, Harvard, Chicago, IEEE, and Vancouver.
 *
 * Ported from the Python for behavioural parity, with two deliberate
 * deviations: the terminal-period doubling the Python produced (an author
 * initial's trailing dot next to the style's own period, or a publisher ending
 * in "Co.") is de-duplicated via terminalPeriod; and IEEE uses the correct
 * reference-list author rule (all authors up to six, first author + "et al."
 * for seven or more) rather than the Python's three-author cutoff.
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

/** First-name words -> spaced initials with dots, e.g. "Jane Anne" -> "J. A."; "" -> "". */
function initialsDotted(first: string): string {
  const words = first.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return "";
  return words.map((w) => w.charAt(0).toUpperCase()).join(". ") + ".";
}

/** "Last, First" -> "Last, F. M."; just "Last" when there is no given name; unchanged if there is no comma. */
function authorsLastInitials(creators: string[]): string[] {
  return creators.map((c) => {
    const idx = c.indexOf(",");
    if (idx === -1) return c.trim();
    const last = c.slice(0, idx).trim();
    const first = c.slice(idx + 1).trim();
    const initials = initialsDotted(first);
    return initials ? `${last}, ${initials}` : last;
  });
}

function authorsApa(creators: string[]): string {
  const f = authorsLastInitials(creators);
  if (f.length === 0) return "Unknown author";
  if (f.length === 1) return f[0] ?? "";
  if (f.length === 2) return `${f[0]} & ${f[1]}`;
  if (f.length <= 20) return f.slice(0, -1).join(", ") + ", & " + f[f.length - 1];
  return f.slice(0, 19).join(", ") + ", ... " + f[f.length - 1];
}

function authorsChicago(creators: string[]): string {
  const f = authorsLastInitials(creators);
  if (f.length === 0) return "Unknown author";
  if (f.length === 1) return f[0] ?? "";
  if (f.length <= 3) return f.slice(0, -1).join(", ") + ", and " + f[f.length - 1];
  return f[0] + " et al.";
}

/** IEEE author list entries: "F. M. Last"; just "Last" when there is no given name. */
function authorsIeee(creators: string[]): string[] {
  return creators.map((c) => {
    const idx = c.indexOf(",");
    if (idx === -1) return c.trim();
    const last = c.slice(0, idx).trim();
    const first = c.slice(idx + 1).trim();
    const initials = initialsDotted(first);
    return initials ? `${initials} ${last}` : last;
  });
}

/**
 * IEEE reference-list author string. IEEE lists all authors up to six; for
 * seven or more it gives the first author followed by "et al." (no comma before
 * et al.). Two authors are joined with "and" (no serial comma); three to six use
 * a serial comma before the final "and".
 */
function authorsIeeeFormatted(creators: string[]): string {
  const list = authorsIeee(creators);
  if (list.length === 0) return "Unknown author";
  if (list.length === 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  if (list.length <= 6) {
    return list.slice(0, -1).join(", ") + ", and " + list[list.length - 1];
  }
  return `${list[0]} et al.`;
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
      .map((w) => w.charAt(0).toUpperCase())
      .join("");
    return initials ? `${last} ${initials}` : last;
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
  const authors = authorsIeeeFormatted(authorsFor(r));
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
  const authors = authorsIeeeFormatted(authorsFor(r));
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
  const styleFuncs = STYLE_MAP[style] ?? { article: citeArticleApa, book: citeBookApa };
  const rtype = record.resourceType.toLowerCase();
  const func = ARTICLE_TYPES.has(rtype) ? styleFuncs.article : styleFuncs.book;
  return func(record);
}
