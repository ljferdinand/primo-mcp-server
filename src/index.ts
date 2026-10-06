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
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig, ConfigError } from "./config.js";
import { createServer } from "./server.js";

// dist/index.js -> project root (next to package.json). Resolved from the
// module location, so a project-root .env is found regardless of the launch
// working directory (Claude Desktop may start the server from elsewhere).
loadDotenv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

function main(): void {
  const config = loadConfig();
  // serveStdio owns the per-connection lifecycle and the protocol-era
  // decision: it serves a modern (2026-07-28, stateless) opening or a
  // 2025-era `initialize` handshake from the same factory, building one
  // server instance per connection.
  const handle = serveStdio(() => createServer(config));
  const shutdown = (): void => void handle.close();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

try {
  main();
} catch (err: unknown) {
  if (err instanceof ConfigError) {
    // Missing/invalid configuration: print the actionable message, not a stack.
    console.error(`primo-mcp-server: ${err.message}`);
  } else {
    console.error("Fatal error starting primo-mcp-server:", err);
  }
  process.exit(1);
}
