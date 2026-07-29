/**
 * Format Primo records into compact, LLM-friendly text (port of formatter.py).
 *
 * The availability fallback uses the configured discovery name (e.g. "PittCat",
 * "OneSearch") rather than a hardcoded brand, so the caller passes it in.
 */
import type { PrimoRecord, SearchResponse } from "./models.js";

/** Title-case a space-separated string (mirrors Python str.title() for these inputs). */
function titleCase(value: string): string {
  return value
    .split(" ")
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function typeBadge(resourceType: string): string {
  return resourceType ? titleCase(resourceType.replace(/_/g, " ")) : "Unknown";
}

function yearOf(creationDate: string): string {
  return creationDate ? creationDate.slice(0, 4) : "n.d.";
}

function formatAuthors(creators: string[], maxAuthors = 3): string {
  if (creators.length === 0) return "Unknown author";
  if (creators.length <= maxAuthors) return creators.join("; ");
  return creators.slice(0, maxAuthors).join("; ") + " et al.";
}

function formatIdentifiers(record: PrimoRecord): string {
  const parts: string[] = [];
  if (record.doi) parts.push(`DOI: ${record.doi}`);
  if (record.isbn.length > 0) parts.push(`ISBN: ${record.isbn[0]}`);
  if (record.issn.length > 0) parts.push(`ISSN: ${record.issn[0]}`);
  return parts.length > 0 ? parts.join(" | ") : "";
}

function formatAvailability(record: PrimoRecord, discoveryName: string): string {
  const parts: string[] = [];
  if (record.fulltextAvailable) parts.push("Full text available");
  if (record.deliveryCategory) parts.push(record.deliveryCategory);
  return parts.length > 0
    ? parts.join(" | ")
    : `Check availability in ${discoveryName}`;
}

export function formatSearchResults(
  response: SearchResponse,
  query: string,
  offset: number,
  discoveryName: string,
): string {
  if (response.records.length === 0) {
    return (
      `No results found for "${query}".\n\n` +
      "Suggestions:\n" +
      "- Broaden your search terms\n" +
      "- Check spelling\n" +
      "- Try a different search field (title, creator, subject)\n" +
      "- Remove filters (resource type, date range)"
    );
  }

  const total = response.info.total.toLocaleString("en-US");
  const showingStart = offset + 1;
  const showingEnd = offset + response.records.length;

  const lines: string[] = [
    `Found ${total} results for "${query}" (showing ${showingStart}-${showingEnd})`,
    "",
  ];

  let index = showingStart;
  for (const record of response.records) {
    lines.push(`[${index}] ${record.title}`);
    lines.push(
      `    ${formatAuthors(record.creators)} | ${yearOf(record.creationDate)} | ${typeBadge(record.resourceType)}`,
    );

    const sourceParts: string[] = [];
    if (record.journalTitle) {
      let journalInfo = record.journalTitle;
      if (record.volume) journalInfo += `, ${record.volume}`;
      if (record.issue) journalInfo += `(${record.issue})`;
      if (record.startPage) {
        journalInfo += `, pp. ${record.startPage}`;
        if (record.endPage) journalInfo += `-${record.endPage}`;
      }
      sourceParts.push(journalInfo);
    } else if (record.publisher) {
      sourceParts.push(record.publisher);
    }
    const ident = formatIdentifiers(record);
    if (ident) sourceParts.push(ident);
    if (sourceParts.length > 0) lines.push(`    ${sourceParts.join(" | ")}`);

    const statusParts: string[] = [];
    if (record.peerReviewed) statusParts.push("Peer-reviewed");
    statusParts.push(formatAvailability(record, discoveryName));
    lines.push(`    ${statusParts.join(" | ")}`);
    lines.push(`    Record ID: ${record.recordId}`);
    lines.push("");
    index += 1;
  }

  return lines.join("\n").replace(/\s+$/, "");
}

export function formatRecordDetail(
  record: PrimoRecord,
  discoveryName: string,
): string {
  const lines: string[] = [];

  lines.push(`Title: ${record.title}`);
  lines.push(`Author(s): ${formatAuthors(record.creators, 10)}`);
  if (record.contributors.length > 0) {
    lines.push(`Contributor(s): ${record.contributors.join("; ")}`);
  }
  lines.push(`Year: ${yearOf(record.creationDate)}`);
  lines.push(`Type: ${typeBadge(record.resourceType)}`);

  if (record.publisher) lines.push(`Publisher: ${record.publisher}`);

  if (record.journalTitle) {
    let journal = record.journalTitle;
    if (record.volume) journal += `, vol. ${record.volume}`;
    if (record.issue) journal += `, no. ${record.issue}`;
    if (record.startPage) {
      journal += `, pp. ${record.startPage}`;
      if (record.endPage) journal += `-${record.endPage}`;
    }
    lines.push(`Journal: ${journal}`);
  }

  if (record.language) lines.push(`Language: ${record.language}`);
  if (record.doi) lines.push(`DOI: ${record.doi}`);
  if (record.isbn.length > 0) lines.push(`ISBN: ${record.isbn.join(", ")}`);
  if (record.issn.length > 0) lines.push(`ISSN: ${record.issn.join(", ")}`);
  if (record.subjects.length > 0) lines.push(`Subjects: ${record.subjects.join("; ")}`);
  if (record.keywords.length > 0) lines.push(`Keywords: ${record.keywords.join("; ")}`);

  lines.push(`Peer-reviewed: ${record.peerReviewed ? "Yes" : "No"}`);

  if (record.description) {
    let desc = record.description;
    if (desc.length > 500) desc = desc.slice(0, 497) + "...";
    lines.push(`\nDescription:\n${desc}`);
  }

  lines.push(`\nAvailability: ${formatAvailability(record, discoveryName)}`);
  if (record.sourceLabel) lines.push(`Source: ${record.sourceLabel}`);
  lines.push(`Record ID: ${record.recordId}`);

  return lines.join("\n");
}

export function formatSuggestions(suggestions: string[], query: string): string {
  if (suggestions.length === 0) return `No suggestions found for "${query}".`;
  const lines: string[] = [`Suggestions for "${query}":`, ""];
  for (const s of suggestions) lines.push(`  - ${s}`);
  return lines.join("\n");
}
