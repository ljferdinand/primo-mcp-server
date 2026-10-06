# Migration: MCP SDK v1 → v2 (protocol `2026-07-28`)

This server was ported from the v1 MCP TypeScript SDK
(`@modelcontextprotocol/sdk`, protocol ≤ `2025-11-25`) to the **v2 SDK**
(`@modelcontextprotocol/server`), which implements the `2026-07-28` spec
revision. The move was mechanical because this server uses only the high-level
`McpServer` abstraction and none of the features the new spec removed,
reworked, or deprecated (sessions, the `initialize` handshake, sampling, roots,
logging, `ping`, `resources/subscribe`, tasks, MRTR). Those are all handled
inside the SDK, not here.

## What changed

| Area | Before (v1) | After (v2) |
| --- | --- | --- |
| Server package | `@modelcontextprotocol/sdk@^1.30` | `@modelcontextprotocol/server@^2.3` |
| Server import | `@modelcontextprotocol/sdk/server/mcp.js` | `@modelcontextprotocol/server` |
| Tool registration | `server.tool(name, description, zodShape, handler)` | `server.registerTool(name, { description, inputSchema }, handler)` |
| Input schema | raw object of zod fields `{ query: z.string(), … }` | `z.object({ query: z.string(), … })` |
| Transport | `new StdioServerTransport()` + `server.connect(transport)` | `serveStdio(() => createServer(config))` |
| zod | `^3.23.8` | `^4.2.0` |
| Node | `>=18` | `>=20` (v2 engine floor) |

Everything outside the two MCP files is unchanged: `client.ts`, `models.ts`,
`formatter.ts`, `citations.ts`, `exporters.ts`, and `config.ts` are pure Primo
HTTP/formatting logic and are untouched by any protocol version. The tool result
shape (`{ content: [{ type: "text", text }] }`) and the "return errors as text
content" convention are identical in v2 — the SDK now stamps each result with
`resultType: "complete"` for you.

Most of the edits were produced by the official codemod and then hand-cleaned:

```bash
npx @modelcontextprotocol/codemod@2.3.1 v1-to-v2 src
```

The codemod rewrote the imports, wrapped each tool schema in `z.object()`, and
swapped the package in `package.json`. Two things were finished by hand:

- `src/index.ts` now uses `serveStdio(factory)` (the documented v2 stdio entry
  point) instead of the codemod's minimal import-only rewrite that kept the old
  `StdioServerTransport` + `connect()` pattern. `serveStdio` owns the
  per-connection lifecycle and the protocol-era decision.
- zod was bumped to `^4.2.0` (v2's floor) and the Node engine to `>=20`.

## A note on the advertised protocol version

The v2 package still reports `LATEST_PROTOCOL_VERSION = "2025-11-25"` and lists
`2025-11-25` as the top of `SUPPORTED_PROTOCOL_VERSIONS`. `2026-07-28` is the
new **stateless** protocol, and the SDK serves it when a client opens with it,
rather than advertising it as the default negotiated version. Both paths are
verified against the compiled binary:

- 2025-era: `initialize` → `tools/list` negotiates `2025-06-18` and lists all
  five tools.
- `2026-07-28`: a stateless `tools/list` carrying
  `io.modelcontextprotocol/protocolVersion` in `_meta` returns
  `resultType: "complete"`, the five tools, `serverInfo` in the result `_meta`,
  and the new `ttlMs` / `cacheScope` cache hints — no `initialize` required.

## Verification

- `npm run typecheck` — clean
- `npm test` — 93 tests pass, including `tests/server.test.ts`, a new Client↔
  Server round-trip over the in-memory transport (lists the five tools in
  registration order; round-trips a `tools/call`; confirms a client error comes
  back as text, not a protocol error)
- `npm run build` — succeeds
- Manual stdio smoke of `dist/index.js` for both protocol eras (above)
