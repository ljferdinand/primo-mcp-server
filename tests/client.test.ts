import { describe, it, expect } from "vitest";
import { PrimoClient, PrimoApiError } from "../src/client.js";
import { loadConfig } from "../src/config.js";

// Assumes no PRIMO_ environment overrides are set (UWA defaults).

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): PrimoClient {
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
  return new PrimoClient(loadConfig(), fetchImpl);
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
    expect(qInclude).toContain("facet_creationdate,exact,2020");
    expect(qInclude).toContain("facet_creationdate,exact,2021");
    expect(qInclude).toContain("facet_creationdate,exact,2022");
    expect(qInclude).toContain("facet_tlevel,exact,peer_reviewed");

    expect(resp.records.length).toBe(1);
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
