/**
 * HTTP client for the Primo public REST API (Node port of client.py).
 *
 * Search and suggest hit the public `/primaws/rest/pub` endpoints with a view
 * ID and no authentication. Single-record lookup additionally uses the direct
 * full-display endpoint `/pnxs/{context}/{docid}`, which Primo VE only serves
 * with an Authorization header. That token is an anonymous *guest* JWT the
 * institution issues to any caller with no API key or credentials (the same
 * session token a signed-out browser receives); it is fetched from
 * `/institution/{code}/guestJwt`, cached, and refreshed on expiry or a 401/403.
 * A shared fetch implementation, a request timeout, and a max-results cap keep
 * usage courteous. `fetchImpl` is injectable so the client can be unit-tested
 * without network access.
 */
import type { PrimoConfig } from "./config.js";
import {
  type PrimoRecord,
  type SearchResponse,
  recordFromApiDoc,
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

/** Strip the Alma "alma" prefix for MMS-ID lookups and matching. */
function normaliseAlmaId(recordId: string): string {
  const rid = recordId.trim();
  return rid.toLowerCase().startsWith("alma") ? rid.slice(4) : rid;
}

/** True for exact IDs, or Alma IDs equivalent with/without the prefix. */
function recordIdsMatch(foundId: string, requestedId: string): boolean {
  const found = foundId.trim();
  const requested = requestedId.trim();
  return (
    found === requested || normaliseAlmaId(found) === normaliseAlmaId(requested)
  );
}

export class PrimoClient {
  private readonly config: PrimoConfig;
  private readonly fetchImpl: FetchLike;

  // Anonymous guest JWT, cached for the direct full-display endpoint.
  private guestJwtToken: string | null = null;
  private guestJwtExpiry = 0; // ms epoch; 0 means "none cached".

  private static readonly JWT_SAFETY_MARGIN_SECONDS = 300;
  private static readonly JWT_FALLBACK_LIFETIME_SECONDS = 1800;

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
    const rid = recordId.trim();
    if (!rid) return null;

    // Preferred path: the direct full-display endpoint (guest-JWT authed).
    const direct = await this.getRecordDirect(rid);
    if (direct) return direct;

    // Fallback: search-based lookup, returning a record only when its ID
    // verifiably matches the request, so a mismatched result is never handed
    // back (the previous "return the first hit" behaviour is gone).
    for (const [tab, scopeParam, query] of this.recordSearchPlan(rid)) {
      const params: Record<string, string> = {
        vid: this.config.vid,
        tab,
        scope: scopeParam,
        q: `any,contains,${query}`,
        offset: "0",
        limit: "5",
        lang: this.config.language,
      };
      const data = await this.get("/pnxs", params);
      const response = searchResponseFromApi(data);
      for (const record of response.records) {
        if (recordIdsMatch(record.recordId, rid)) return record;
      }
    }
    return null;
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

  // -- Guest JWT + direct record --------------------------------------------

  private institutionCode(): string {
    const cfg = this.config;
    if (cfg.institutionCode) return cfg.institutionCode;
    const i = cfg.vid.indexOf(":");
    return i === -1 ? cfg.vid : cfg.vid.slice(0, i);
  }

  private viewId(): string {
    const vid = this.config.vid;
    const i = vid.indexOf(":");
    return i === -1 ? vid : vid.slice(i + 1);
  }

  /** Read the exp claim (epoch seconds) from a JWT payload without verifying. */
  private static jwtExpiryEpoch(token: string): number | null {
    try {
      const segment = token.split(".")[1];
      if (!segment) return null;
      const payload = JSON.parse(
        Buffer.from(segment, "base64url").toString("utf8"),
      ) as Record<string, unknown>;
      const exp = payload.exp;
      return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
    } catch {
      return null;
    }
  }

  /** Return a cached anonymous guest JWT, fetching one when needed. */
  private async guestJwt(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.guestJwtToken && now < this.guestJwtExpiry) {
      return this.guestJwtToken;
    }

    const cfg = this.config;
    const path = `/institution/${this.institutionCode()}/guestJwt`;
    const params: Record<string, string> = {
      vid: cfg.vid,
      lang: cfg.language,
      isGuest: "true",
      viewId: this.viewId(),
    };

    const response = await this.rawFetch(path, params);
    if (!response.ok) {
      throw new PrimoApiError(
        `Could not obtain a Primo guest token from ${path} (HTTP ${response.status}). ` +
          "Direct record lookup is unavailable; falling back to search-based lookup.",
        response.status,
      );
    }
    const token = (await response.text())
      .trim()
      .replace(/^"+/, "")
      .replace(/"+$/, "");
    if (!token) {
      throw new PrimoApiError(
        "Primo guest token endpoint returned an empty token.",
      );
    }

    const exp = PrimoClient.jwtExpiryEpoch(token);
    const lifetimeSeconds =
      exp !== null
        ? Math.max(
            exp - Date.now() / 1000 - PrimoClient.JWT_SAFETY_MARGIN_SECONDS,
            60,
          )
        : PrimoClient.JWT_FALLBACK_LIFETIME_SECONDS;
    this.guestJwtToken = token;
    this.guestJwtExpiry = now + lifetimeSeconds * 1000;
    return token;
  }

  /**
   * Fetch a record from `/pnxs/{context}/{docid}`. Tries local (`L`) context
   * first for Alma/numeric IDs and Primo Central (`PC`) first otherwise,
   * refreshing the guest JWT once on a 401/403. Returns null on any failure so
   * getRecord can fall back to search. A record is returned only when its ID
   * matches the request.
   */
  private async getRecordDirect(recordId: string): Promise<PrimoRecord | null> {
    const isAlmaLike =
      recordId.toLowerCase().startsWith("alma") || /^\d+$/.test(recordId);
    const contexts: string[] = isAlmaLike ? ["L", "PC"] : ["PC", "L"];

    let token: string;
    try {
      token = await this.guestJwt();
    } catch (err) {
      if (err instanceof PrimoApiError) return null;
      throw err;
    }

    for (const context of contexts) {
      let data = await this.fetchDirect(context, recordId, token);
      if (data === "auth") {
        try {
          token = await this.guestJwt(true);
        } catch (err) {
          if (err instanceof PrimoApiError) return null;
          throw err;
        }
        data = await this.fetchDirect(context, recordId, token);
      }
      if (data === "auth" || data === null) continue;

      const doc = PrimoClient.mergeDirectDelivery(data);
      const record = recordFromApiDoc(doc);
      if (recordIdsMatch(record.recordId, recordId)) return record;
    }
    return null;
  }

  /** Direct doc, "auth" for 401/403, or null on any other failure. */
  private async fetchDirect(
    context: string,
    recordId: string,
    token: string,
  ): Promise<Record<string, unknown> | "auth" | null> {
    const cfg = this.config;
    const encoded = encodeURIComponent(recordId);
    try {
      const response = await this.rawFetch(
        `/pnxs/${context}/${encoded}`,
        { vid: cfg.vid, lang: cfg.language },
        { Authorization: `Bearer ${token}` },
      );
      if (response.status === 401 || response.status === 403) return "auth";
      if (!response.ok) return null;
      const data: unknown = await response.json();
      if (!isObject(data) || !isObject(data.pnx)) return null;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * The direct endpoint returns delivery data at the top level rather than
   * inside the pnx block; map it into pnx shape so the shared parser reads
   * availability the same way it does for search results.
   */
  private static mergeDirectDelivery(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const pnx = data.pnx;
    if (!isObject(pnx)) return data;
    if (pnx.delivery) return data;
    const topDelivery = data.delivery;
    if (!isObject(topDelivery)) return data;
    const mapped = {
      delcategory: topDelivery.deliveryCategory ?? [],
      fulltext: topDelivery.availability ?? [],
    };
    return { ...data, pnx: { ...pnx, delivery: mapped } };
  }

  /** Search attempts used to resolve a record ID when the direct fetch fails. */
  private recordSearchPlan(recordId: string): Array<[string, string, string]> {
    const cfg = this.config;
    const rid = recordId.trim();
    const isAlmaLike = rid.toLowerCase().startsWith("alma") || /^\d+$/.test(rid);
    if (!isAlmaLike) {
      return [[cfg.tabEverything, cfg.scopeCombined, rid]];
    }

    const normalised = normaliseAlmaId(rid);
    const queries: string[] = [rid];
    if (normalised !== rid) queries.push(normalised);
    const almaPrefixed = /^\d+$/.test(normalised)
      ? `alma${normalised}`
      : normalised;
    if (!queries.includes(almaPrefixed)) queries.push(almaPrefixed);

    const plan: Array<[string, string, string]> = [];
    for (const q of queries) plan.push([cfg.tabCatalogue, cfg.scopeLocal, q]);
    for (const q of queries) plan.push([cfg.tabEverything, cfg.scopeCombined, q]);
    return plan;
  }

  // -- Transport ------------------------------------------------------------

  /** Build the URL, apply the timeout, and return the raw Response. */
  private async rawFetch(
    path: string,
    params: Record<string, string>,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const cfg = this.config;
    const url = `${cfg.baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    try {
      return await this.fetchImpl(url, {
        method: "GET",
        headers: {
          "User-Agent": cfg.userAgent,
          Accept: "application/json",
          ...extraHeaders,
        },
        signal: controller.signal,
      });
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

  private async get(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const response = await this.rawFetch(path, params);
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
    try {
      return (await response.json()) as unknown;
    } catch (err) {
      throw new PrimoApiError(`Unexpected error querying Primo: ${String(err)}`);
    }
  }
}
