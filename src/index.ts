#!/usr/bin/env node
/**
 * Entry point for the Primo MCP server (Node port).
 *
 * Loads .env from the project root (if present), builds the server, and serves
 * over stdio. Variables already set in the process environment -- for example
 * via an "env" block in the Claude Desktop MCP config, or a shell export --
 * take precedence over .env; dotenv does not override them.
 */
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ConfigError } from "./config.js";
import { createServer } from "./server.js";

// dist/index.js -> project root (next to package.json). Resolved from the
// module location, so a project-root .env is found regardless of the launch
// working directory (Claude Desktop may start the server from elsewhere).
loadDotenv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    // Missing/invalid configuration: print the actionable message, not a stack.
    console.error(`primo-mcp-server: ${err.message}`);
  } else {
    console.error("Fatal error starting primo-mcp-server:", err);
  }
  process.exit(1);
});
