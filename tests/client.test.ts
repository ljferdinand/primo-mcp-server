import { describe, it, expect } from "vitest";
import { PrimoClient, PrimoApiError } from "../src/client.js";
import { loadConfig } from "../src/config.js";

// PRIMO_BASE_URL and PRIMO_VID come from tests/setup.ts; the remaining PRIMO_
// variables use their built-in defaults.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

function makeClient(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): PrimoClient {
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
  return new PrimoClient(loadConfig(), fetchImpl);
}

/** Build an unsigned JWT carrying an exp claim (epoch seconds). */
function makeJwt(expEpochSeconds: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: expEpochSeconds }),
  ).toString("base64url");
  return `${header}.${payload}.`;
}

/** A single direct full-display document (top-level delivery, like Primo VE). */
function directDoc(recordId: string, title: string): unknown {
  return {
    context: recordId.toLowerCase().startsWith("alma") ? "L" : "PC",
    pnx: {
      control: { recordid: [recordId], sourcesystem: ["Alma"] },
      display: { title },
    },
    delivery: {
      deliveryCategory: ["Alma-P"],
      availability: ["fulltext_linktorsrc"],
      holding: [
        {
          mainLocation: "Falk Library",
          libraryCode: "HSLS",
          subLocation: "Rare Books (Non Circulating)",
          callNumber: "RC681 B815d 1884",
          availabilityStatus: "available",
        },
      ],
    },
  };
}

describe("PrimoClient.search", () => {
  it("builds the /pnxs query with q, tab, scope and facet filters", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({
        info: { total: 1 },
        docs: [{ pnx: { display: { title: "X" } } }],
      });
    });

    const resp = await client.search({
      query: "machine learning",
      field: "any",
      scope: "everything",
      resourceType: "articles",
      dateFrom: "2020",
      dateTo: "2022",
      peerReviewed: true,
      limit: 5,
    });

    const u = new URL(captured);
    expect(u.pathname.endsWith("/pnxs")).toBe(true);
    expect(u.searchParams.get("q")).toBe("any,contains,machine learning");
    expect(u.searchParams.get("tab")).toBe("Everything");
    expect(u.searchParams.get("scope")).toBe("MyInst_and_CI");
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("pcAvailability")).toBe("true");

    const qInclude = u.searchParams.get("qInclude") ?? "";
    expect(qInclude).toContain("facet_rtype,exact,articles");
    expect(qInclude).toContain("facet_searchcreationdate,exact,[2020 TO 2022]");
    expect(qInclude).toContain("facet_tlevel,exact,peer_reviewed");

    expect(resp.records.length).toBe(1);
  });

  it("emits a single-year range facet when only date_from is given", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({ info: {}, docs: [] });
    });
    await client.search({ query: "x", dateFrom: "2019" });
    const qInclude = new URL(captured).searchParams.get("qInclude") ?? "";
    expect(qInclude).toContain("facet_searchcreationdate,exact,[2019 TO 2019]");
  });

  it("uses catalogue tab/scope when scope=catalogue", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({ info: {}, docs: [] });
    });
    await client.search({ query: "x", scope: "catalogue" });
    const u = new URL(captured);
    expect(u.searchParams.get("tab")).toBe("Catalogue");
    expect(u.searchParams.get("scope")).toBe("MyInstitution");
  });

  it("caps limit at maxResultsPerRequest", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({ info: {}, docs: [] });
    });
    await client.search({ query: "x", limit: 999 });
    expect(new URL(captured).searchParams.get("limit")).toBe("50");
  });

  it("sets pcAvailability=false when include_unavailable is false", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({ info: {}, docs: [] });
    });
    await client.search({ query: "x", includeUnavailable: false });
    expect(new URL(captured).searchParams.get("pcAvailability")).toBe("false");
  });

  it("sets pcAvailability=true when include_unavailable is true", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({ info: {}, docs: [] });
    });
    await client.search({ query: "x", includeUnavailable: true });
    expect(new URL(captured).searchParams.get("pcAvailability")).toBe("true");
  });

  it("defaults pcAvailability to true (expanded) when include_unavailable is omitted", async () => {
    let captured = "";
    const client = makeClient(async (url) => {
      captured = url;
      return jsonResponse({ info: {}, docs: [] });
    });
    await client.search({ query: "x" });
    expect(new URL(captured).searchParams.get("pcAvailability")).toBe("true");
  });
});

describe("PrimoClient error mapping", () => {
  it("maps HTTP 400 to a PrimoApiError", async () => {
    const client = makeClient(async () => jsonResponse({}, 400));
    await expect(client.search({ query: "x" })).rejects.toBeInstanceOf(
      PrimoApiError,
    );
  });

  it("maps HTTP 5xx to a PrimoApiError", async () => {
    const client = makeClient(async () => jsonResponse({}, 503));
    await expect(client.search({ query: "x" })).rejects.toBeInstanceOf(
      PrimoApiError,
    );
  });
});

describe("PrimoClient.suggest", () => {
  it("extracts non-empty suggestion texts", async () => {
    const client = makeClient(async () =>
      jsonResponse({
        response: {
          docs: [
            { text: "machine learning" },
            { text: "machine vision" },
            {},
          ],
        },
      }),
    );
    const out = await client.suggest("machine");
    expect(out).toEqual(["machine learning", "machine vision"]);
  });
});

describe("PrimoClient.getRecord", () => {
  it("returns the exact record_id match over the first result", async () => {
    const client = makeClient(async () =>
      jsonResponse({
        info: {},
        docs: [
          { pnx: { control: { recordid: ["other1"] }, display: { title: "Other" } } },
          { pnx: { control: { recordid: ["target"] }, display: { title: "Target" } } },
        ],
      }),
    );
    const rec = await client.getRecord("target");
    expect(rec?.recordId).toBe("target");
    expect(rec?.title).toBe("Target");
  });

  it("returns null when there are no results", async () => {
    const client = makeClient(async () => jsonResponse({ info: {}, docs: [] }));
    const rec = await client.getRecord("missing");
    expect(rec).toBeNull();
  });
});

describe("PrimoClient.getRecord direct full-display path", () => {
  const futureExp = Math.floor(Date.now() / 1000) + 3600;

  it("fetches directly with a guest JWT and returns the matching record", async () => {
    const jwt = makeJwt(futureExp);
    let directHit = false;
    let authHeader: string | null = null;
    const client = makeClient(async (url, init) => {
      if (url.includes("/institution/") && url.includes("guestJwt")) {
        expect(new URL(url).searchParams.get("isGuest")).toBe("true");
        return textResponse(jwt);
      }
      if (url.includes("/pnxs/L/")) {
        directHit = true;
        authHeader = new Headers(init?.headers).get("Authorization");
        return jsonResponse(directDoc("alma991", "Direct Hit"));
      }
      return jsonResponse({ info: {}, docs: [] });
    });

    const rec = await client.getRecord("alma991");
    expect(directHit).toBe(true);
    expect(authHeader).toBe(`Bearer ${jwt}`);
    expect(rec?.recordId).toBe("alma991");
    expect(rec?.title).toBe("Direct Hit");
    expect(rec?.holdings).toEqual([
      {
        library: "Falk Library",
        libraryCode: "HSLS",
        location: "Rare Books (Non Circulating)",
        callNumber: "RC681 B815d 1884",
        availabilityStatus: "available",
      },
    ]);
  });

  it("refreshes the guest JWT once on a 401 and retries", async () => {
    const jwt1 = makeJwt(futureExp);
    const jwt2 = makeJwt(futureExp + 60);
    let jwtCalls = 0;
    const client = makeClient(async (url, init) => {
      if (url.includes("guestJwt")) {
        jwtCalls += 1;
        return textResponse(jwtCalls === 1 ? jwt1 : jwt2);
      }
      if (url.includes("/pnxs/L/")) {
        const auth = new Headers(init?.headers).get("Authorization");
        if (auth === `Bearer ${jwt1}`) return jsonResponse({}, 401);
        return jsonResponse(directDoc("alma991", "After Refresh"));
      }
      return jsonResponse({ info: {}, docs: [] });
    });

    const rec = await client.getRecord("alma991");
    expect(jwtCalls).toBe(2);
    expect(rec?.title).toBe("After Refresh");
  });

  it("falls back to a match-only search when the guest token is unavailable", async () => {
    const client = makeClient(async (url) => {
      if (url.includes("guestJwt")) return jsonResponse({}, 500);
      return jsonResponse({
        info: {},
        docs: [
          { pnx: { control: { recordid: ["alma000"] }, display: { title: "Decoy" } } },
          { pnx: { control: { recordid: ["alma991"] }, display: { title: "Found" } } },
        ],
      });
    });

    const rec = await client.getRecord("alma991");
    expect(rec?.recordId).toBe("alma991");
    expect(rec?.title).toBe("Found");
  });

  it("returns null rather than a mismatched record", async () => {
    const jwt = makeJwt(futureExp);
    const client = makeClient(async (url) => {
      if (url.includes("guestJwt")) return textResponse(jwt);
      // Direct endpoint yields no usable pnx, forcing the search fallback;
      // the fallback then sees only a non-matching record.
      if (/\/pnxs\/(L|PC)\//.test(url)) return jsonResponse({ info: {}, docs: [] });
      return jsonResponse({
        info: {},
        docs: [
          { pnx: { control: { recordid: ["alma777"] }, display: { title: "Wrong" } } },
        ],
      });
    });

    const rec = await client.getRecord("alma991");
    expect(rec).toBeNull();
  });
});
