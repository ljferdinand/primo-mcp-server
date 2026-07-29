/**
 * HTTP client for the Primo public REST API (Node port of client.py).
 *
 * Hits only the public `/primaws/rest/pub` endpoints with a view ID: no
 * per-user authentication. A shared fetch implementation, a request timeout,
 * and a max-results cap keep usage courteous. `fetchImpl` is injectable so the
 * client can be unit-tested without network access.
 */
import type { PrimoConfig } from "./config.js";
import {
  type PrimoRecord,
  type SearchResponse,
  searchResponseFromApi,
} from "./models.js";

export class PrimoApiError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "PrimoApiError";
    this.statusCode = statusCode;
  }
}

export interface SearchOptions {
  query: string;
  field?: string;
  scope?: string;
  sortBy?: string;
  limit?: number;
  offset?: number;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  peerReviewed?: boolean;
}

type FetchLike = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PrimoClient {
  private readonly config: PrimoConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: PrimoConfig, fetchImpl: FetchLike = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const cfg = this.config;
    const field = options.field ?? "any";
    const scope = options.scope ?? "everything";
    const sortBy = options.sortBy ?? "rank";
    const limit = Math.min(
      Math.max(1, options.limit ?? cfg.defaultResults),
      cfg.maxResultsPerRequest,
    );
    const offset = Math.max(0, options.offset ?? 0);

    let tab: string;
    let scopeParam: string;
    if (scope === "catalogue") {
      tab = cfg.tabCatalogue;
      scopeParam = cfg.scopeLocal;
    } else {
      tab = cfg.tabEverything;
      scopeParam = cfg.scopeCombined;
    }

    const params: Record<string, string> = {
      vid: cfg.vid,
      tab,
      scope: scopeParam,
      q: `${field},contains,${options.query}`,
      offset: String(offset),
      limit: String(limit),
      lang: cfg.language,
      sortby: sortBy,
      pcAvailability: "true",
    };

    const qInclude: string[] = [];
    if (options.resourceType) {
      qInclude.push(`facet_rtype,exact,${options.resourceType}`);
    }
    if (options.dateFrom && options.dateTo) {
      const from = Number.parseInt(options.dateFrom, 10);
      const to = Number.parseInt(options.dateTo, 10);
      if (Number.isFinite(from) && Number.isFinite(to) && from <= to) {
        // Primo takes individual year facets; a range adds one per year.
        // Wide ranges produce many facets -- flagged for the cleanup follow-up.
        for (let year = from; year <= to; year++) {
          qInclude.push(`facet_creationdate,exact,${year}`);
        }
      }
    } else if (options.dateFrom) {
      qInclude.push(`facet_creationdate,exact,${options.dateFrom}`);
    }
    if (options.peerReviewed) {
      qInclude.push("facet_tlevel,exact,peer_reviewed");
    }
    if (qInclude.length > 0) {
      params.qInclude = qInclude.join("|,|");
    }

    const data = await this.get("/pnxs", params);
    return searchResponseFromApi(data);
  }

  async getRecord(recordId: string): Promise<PrimoRecord | null> {
    const cfg = this.config;
    const params: Record<string, string> = {
      vid: cfg.vid,
      tab: cfg.tabEverything,
      scope: cfg.scopeCombined,
      q: `any,contains,${recordId}`,
      offset: "0",
      limit: "5",
      lang: cfg.language,
    };
    const data = await this.get("/pnxs", params);
    const response = searchResponseFromApi(data);
    for (const record of response.records) {
      if (record.recordId === recordId) return record;
    }
    return response.records.length > 0 ? response.records[0] : null;
  }

  async suggest(query: string): Promise<string[]> {
    const cfg = this.config;
    const params: Record<string, string> = {
      vid: cfg.vid,
      q: query,
      lang: cfg.language,
    };
    const data = await this.get("/suggest", params);
    const response = asRecord(asRecord(data).response);
    const docs = Array.isArray(response.docs) ? response.docs : [];
    const texts: string[] = [];
    for (const doc of docs) {
      const text = asRecord(doc).text;
      if (typeof text === "string" && text) texts.push(text);
    }
    return texts;
  }

  async getRecords(recordIds: string[]): Promise<PrimoRecord[]> {
    // Sequential by decision (courteous to the API).
    const records: PrimoRecord[] = [];
    for (const id of recordIds) {
      const record = await this.getRecord(id);
      if (record) records.push(record);
    }
    return records;
  }

  private async get(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const cfg = this.config;
    const url = `${cfg.baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          "User-Agent": cfg.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const status = response.status;
        if (status === 400) {
          throw new PrimoApiError(
            "Bad request (HTTP 400). Check your search query and parameters.",
            400,
          );
        }
        if (status >= 500) {
          throw new PrimoApiError(
            `Primo API server error (HTTP ${status}). The service may be experiencing issues. Try again later.`,
            status,
          );
        }
        throw new PrimoApiError(`Primo API returned HTTP ${status}.`, status);
      }
      return (await response.json()) as unknown;
    } catch (err) {
      if (err instanceof PrimoApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new PrimoApiError(
          `Request timed out after ${Math.round(cfg.requestTimeoutMs / 1000)}s. The Primo API may be slow or unavailable. Try again shortly.`,
        );
      }
      if (err instanceof TypeError) {
        throw new PrimoApiError(
          `Could not connect to ${cfg.baseUrl}. Check your network connection and that the Primo API is available.`,
        );
      }
      throw new PrimoApiError(`Unexpected error querying Primo: ${String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
