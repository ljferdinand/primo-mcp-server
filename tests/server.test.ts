import { describe, it, expect } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import type { PrimoClient } from "../src/client.js";

// Smoke test for the MCP layer itself: register the tools on a real McpServer
// (v2, @modelcontextprotocol/server) and drive them from a real Client over a
// linked in-memory transport pair. This is the guard the migration plan calls
// for -- it exercises tools/list and tools/call end to end, so an SDK/protocol
// change that breaks registration or the result shape fails here rather than
// only in a live client. The Primo HTTP client is stubbed; no network.

const TOOL_NAMES = [
  "primo_search",
  "primo_get_record",
  "primo_suggest",
  "primo_cite",
  "primo_export",
];

/** A PrimoClient stub exposing only what these tools touch. */
function stubClient(overrides: Partial<PrimoClient> = {}): PrimoClient {
  return {
    suggest: async () => ["entrepreneurship", "entrepreneur"],
    ...overrides,
  } as unknown as PrimoClient;
}

async function connectedClient(client: PrimoClient): Promise<Client> {
  const server = createServer(loadConfig(), client);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcp = new Client({ name: "test", version: "0.0.0" });
  await mcp.connect(clientTransport);
  return mcp;
}

describe("MCP server (createServer)", () => {
  it("lists all five tools in registration order", async () => {
    const mcp = await connectedClient(stubClient());
    try {
      const { tools } = await mcp.listTools();
      expect(tools.map((t) => t.name)).toEqual(TOOL_NAMES);
      // Every tool advertises a description and an object input schema.
      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema.type).toBe("object");
      }
    } finally {
      await mcp.close();
    }
  });

  it("round-trips a tools/call and returns text content", async () => {
    const mcp = await connectedClient(stubClient());
    try {
      const result = await mcp.callTool({
        name: "primo_suggest",
        arguments: { query: "entrepre" },
      });
      const content = result.content as { type: string; text: string }[];
      expect(content[0].type).toBe("text");
      expect(content[0].text).toContain("entrepreneurship");
    } finally {
      await mcp.close();
    }
  });

  it("surfaces client errors as text, not a protocol error", async () => {
    const mcp = await connectedClient(
      stubClient({
        suggest: async () => {
          throw new Error("boom");
        },
      }),
    );
    try {
      const result = await mcp.callTool({
        name: "primo_suggest",
        arguments: { query: "x" },
      });
      const content = result.content as { type: string; text: string }[];
      expect(content[0].text).toContain("Unexpected error");
    } finally {
      await mcp.close();
    }
  });
});
