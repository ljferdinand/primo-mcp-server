/**
 * MCP server for Primo library discovery (Node port of server.py).
 * Registers all five tools: primo_search, primo_get_record, primo_suggest,
 * primo_cite, primo_export.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PrimoConfig } from "./config.js";
import { PrimoApiError, PrimoClient } from "./client.js";
import {
  formatRecordDetail,
  formatSearchResults,
  formatSuggestions,
} from "./formatter.js";
import { formatCitation } from "./citations.js";
import { exportBibtex, exportCsv, exportRis } from "./exporters.js";

function textResult(text: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text }] };
}

function errorText(action: string, err: unknown): string {
  if (err instanceof PrimoApiError) return `Error ${action}: ${err.message}`;
  return `Unexpected error: ${String(err)}`;
}

export function createServer(
  config: PrimoConfig,
  client: PrimoClient = new PrimoClient(config),
): McpServer {
  const server = new McpServer({ name: "primo", version: "0.1.0" });

  server.tool(
    "primo_search",
    "Search the university library catalogue and subscribed databases (ProQuest, Elsevier, Crossref, Gale, Springer, IEEE, etc.) via the Ex Libris Primo discovery API. Returns a compact list with title, authors, year, identifiers, and availability.",
    {
      query: z
        .string()
        .describe(
          "Search terms, e.g. 'machine learning entrepreneurship'. Avoid commas in the query: Primo reads a comma as a field delimiter, so a comma in the terms can distort the search.",
        ),
      field: z
        .enum(["any", "title", "creator", "sub", "isbn", "oclcnum"])
        .optional()
        .describe("Search field: any (default), title, creator, sub, isbn, oclcnum."),
      scope: z
        .enum(["everything", "catalogue"])
        .optional()
        .describe("everything (local + subscribed databases, default) or catalogue (local only)."),
      sort_by: z
        .enum(["rank", "date", "title"])
        .optional()
        .describe("rank (relevance, default), date (newest first), or title."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of results, 1-50 (default 10)."),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination offset (default 0)."),
      resource_type: z
        .enum(["books", "articles", "journals", "dissertations", "conference_proceedings"])
        .optional()
        .describe("Filter by type: books, articles, journals, dissertations, conference_proceedings."),
      date_from: z.string().optional().describe("Start year filter, YYYY."),
      date_to: z.string().optional().describe("End year filter, YYYY."),
      peer_reviewed: z.boolean().optional().describe("Set true to show only peer-reviewed items."),
      include_unavailable: z
        .boolean()
        .optional()
        .describe("Include records the library has no full-text access to (Primo's expanded search). Defaults to broad (included); set false to restrict results to currently-available material."),
    },
    async (args) => {
      try {
        const response = await client.search({
          query: args.query,
          field: args.field,
          scope: args.scope,
          sortBy: args.sort_by,
          limit: args.limit,
          offset: args.offset,
          resourceType: args.resource_type,
          dateFrom: args.date_from,
          dateTo: args.date_to,
          peerReviewed: args.peer_reviewed,
          includeUnavailable: args.include_unavailable,
        });
        return textResult(
          formatSearchResults(response, args.query, args.offset ?? 0, config.discoveryName),
        );
      } catch (err) {
        return textResult(errorText("searching Primo", err));
      }
    },
  );

  server.tool(
    "primo_get_record",
    "Get full details for a single library record. Use a record ID from primo_search results to fetch complete metadata: abstract, all authors, subjects, identifiers, and availability.",
    {
      record_id: z
        .string()
        .describe("The Primo record ID, e.g. 'alma991234567890' or 'cdi_crossref_primary_10_1234'."),
    },
    async (args) => {
      try {
        const record = await client.getRecord(args.record_id);
        if (record === null) {
          return textResult(
            `Record "${args.record_id}" not found. It may have been removed, or the ID may be incorrect. Try searching again with primo_search.`,
          );
        }
        return textResult(formatRecordDetail(record, config.discoveryName));
      } catch (err) {
        return textResult(errorText("fetching record", err));
      }
    },
  );

  server.tool(
    "primo_suggest",
    "Get autocomplete suggestions for a search term. Useful for refining searches or checking subject headings before running a full search.",
    {
      query: z.string().describe("Partial search term, e.g. 'entrepre' or 'machine lear'."),
    },
    async (args) => {
      try {
        const suggestions = await client.suggest(args.query);
        return textResult(formatSuggestions(suggestions, args.query));
      } catch (err) {
        return textResult(errorText("getting suggestions", err));
      }
    },
  );

  server.tool(
    "primo_cite",
    "Generate formatted citations for library records. Always verify generated citations before submission.",
    {
      record_ids: z.array(z.string()).describe("Primo record IDs to cite."),
      style: z
        .enum(["apa7", "harvard", "chicago", "ieee", "vancouver"])
        .optional()
        .describe("Citation style: apa7 (default), harvard, chicago, ieee, vancouver."),
    },
    async (args) => {
      try {
        const style = args.style ?? "apa7";
        const records = await client.getRecords(args.record_ids);
        if (records.length === 0) {
          return textResult("No records found for the provided IDs.");
        }
        const citations = records.map((r) => formatCitation(r, style));
        return textResult(
          citations.join("\n\n") +
            "\n\n-- Note: verify citations before submission. Automated formatting may not cover all edge cases.",
        );
      } catch (err) {
        return textResult(errorText("fetching records for citation", err));
      }
    },
  );

  server.tool(
    "primo_export",
    "Export library records to reference manager formats (Zotero, Mendeley, EndNote).",
    {
      record_ids: z.array(z.string()).describe("Primo record IDs to export."),
      format: z
        .enum(["bibtex", "ris", "csv"])
        .optional()
        .describe("Export format: bibtex (default), ris, csv."),
    },
    async (args) => {
      try {
        const format = args.format ?? "bibtex";
        const records = await client.getRecords(args.record_ids);
        if (records.length === 0) {
          return textResult("No records found for the provided IDs.");
        }
        if (format === "bibtex") return textResult(exportBibtex(records));
        if (format === "ris") return textResult(exportRis(records));
        return textResult(exportCsv(records));
      } catch (err) {
        return textResult(errorText("fetching records for export", err));
      }
    },
  );

  return server;
}
