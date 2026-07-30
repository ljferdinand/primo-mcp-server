# Primo MCP Server (Node)

MCP server for searching university library catalogues via the Ex Libris Primo
discovery API. This branch (`node-port`) is the Node/TypeScript port; `main`
holds the original Python until parity is signed off.

## Architecture

- **Framework:** `@modelcontextprotocol/sdk` (`McpServer`)
- **Transport:** stdio
- **HTTP client:** global `fetch` (undici), with an `AbortController` timeout
- **Config:** environment variables with the `PRIMO_` prefix (see `config.ts`);
  `PRIMO_BASE_URL` and `PRIMO_VID` are required and have no defaults
- **Validation:** `zod` for tool input schemas

## Key files

- `src/index.ts` -- entry point: loads `.env`, builds the server, serves over stdio
- `src/config.ts` -- config loading and the required-variable fail-fast (`ConfigError`)
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

No built-in institution: set `PRIMO_BASE_URL` and `PRIMO_VID` (the server exits
at startup if either is missing). See `README.md` ("Finding your Primo
settings") and `.env.example`. Other `PRIMO_` variables are optional with
defaults in `config.ts`.

## Conventions

- **Governance boundary:** public Primo REST API (`/primaws/rest/pub`) plus a
  view ID and an anonymous guest token only. No per-user login, no authenticated
  endpoints, no API keys.
- TypeScript strict mode; ESM (`type: module`); Node 18+.
- CSV exports carry a UTF-8 BOM and CRLF line endings for Excel.
- Behavioural parity with the Python is the baseline; deliberate deviations (the
  `$$` subfield strip, per-style place of publication, terminal-period
  de-duplication) are documented in the code and in the project spec note.
