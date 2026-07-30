# Primo MCP Server (PittCat build)

MCP server for searching PittCat (the University of Pittsburgh Library System's
Ex Libris Primo discovery service) via the Ex Libris Primo API. This branch
(`pitt-defaults`) is the Pitt-defaulted build of the Node/TypeScript port; the
`main` branch is the institution-neutral canonical build.

## Architecture

- **Framework:** `@modelcontextprotocol/sdk` (`McpServer`)
- **Transport:** stdio
- **HTTP client:** global `fetch` (undici), with an `AbortController` timeout
- **Config:** environment variables with the `PRIMO_` prefix (see `config.ts`);
  this build has PittCat defaults for every value, so none are required
- **Validation:** `zod` for tool input schemas

## Key files

- `src/index.ts` -- entry point: loads `.env`, builds the server, serves over stdio
- `src/config.ts` -- config loading; PittCat values as the built-in defaults
- `src/server.ts` -- MCP tool definitions (the five `primo_` tools)
- `src/client.ts` -- Primo public REST API client (search, suggest, direct record fetch, guest-JWT handling)
- `src/models.ts` -- PNX response parsing and the `PrimoRecord` model
- `src/formatter.ts` -- compact text output for LLM context
- `src/citations.ts` -- citation formatting (APA 7, Harvard, Chicago, IEEE, Vancouver)
- `src/exporters.ts` -- BibTeX, RIS, CSV export

## Build and run

```bash
npm install
npm run build      # tsc -> dist/
npm start          # node dist/index.js
npm run dev        # run from source with tsx
```

## Running tests

```bash
npm test           # vitest run
npm run typecheck  # tsc --noEmit
```

## Configuration

The PittCat build has University of Pittsburgh / PittCat values baked in as the
built-in defaults (base URL, `PRIMO_VID` `01PITT_INST:01PITT_INST`,
`PRIMO_DISCOVERY_NAME` `PittCat`, `PRIMO_TAB_CATALOGUE` `LibraryCatalog`), so the
server runs with no configuration. Every `PRIMO_` variable is optional and
overrides its default; point the server at another Primo view by setting
`PRIMO_BASE_URL` / `PRIMO_VID`. See `README.md` and `.env.example`. This is a
deliberate, branch-scoped reversal of the canonical build's no-defaults policy.

## Conventions

- **Governance boundary:** public Primo REST API (`/primaws/rest/pub`) plus a
  view ID and an anonymous guest token only. No per-user login, no authenticated
  endpoints, no API keys.
- TypeScript strict mode with `noUncheckedIndexedAccess`; ESM (`type: module`); Node 18+.
- CSV exports carry a UTF-8 BOM and CRLF line endings for Excel.
- Behavioural parity with the canonical build; the only difference on this
  branch is the defaults in `config.ts` (and the docs). Keep code changes in
  sync by merging `main` forward.
