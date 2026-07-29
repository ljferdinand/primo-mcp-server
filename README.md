# primo-mcp-server (Node)

An MCP server for Ex Libris Primo library discovery. It searches a university
catalogue and its subscribed databases (ProQuest, Elsevier, Crossref, Gale,
Springer, IEEE, and so on) over the Model Context Protocol.

This is the Node/TypeScript port. It talks only to Primo's **public** REST API
(the `/primaws/rest/pub` endpoints) with a view ID: no per-user login and no
authenticated endpoints, the same access class as an ordinary catalogue search
in a browser.

## Tools

| Tool | Description |
|------|-------------|
| `primo_search` | Search the catalogue with optional filters (field, scope, type, date range, peer-reviewed) |
| `primo_get_record` | Full details for one record by ID |
| `primo_suggest` | Autocomplete suggestions |
| `primo_cite` | Citations in APA 7, Harvard, Chicago, IEEE, or Vancouver |
| `primo_export` | Export records as BibTeX, RIS, or CSV |

## Requirements

Node.js 18 or newer.

## Install and build

```bash
git clone https://github.com/ljferdinand/primo-mcp-server.git
cd primo-mcp-server
npm install
npm run build
```

The build emits `dist/`; the server entry is `dist/index.js`.

## Register in Claude Desktop

Add a `primo` entry to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS), alongside any existing
servers. Use an **absolute** path to `node` and to `dist/index.js`, because the
app's launch environment has a narrower `PATH` than your shell. Find your node
path with `which node`.

Minimal (uses the built-in UWA defaults):

```json
{
  "mcpServers": {
    "primo": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/primo-mcp-server/dist/index.js"]
    }
  }
}
```

Pointed at your own library, via an `env` block:

```json
{
  "mcpServers": {
    "primo": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/primo-mcp-server/dist/index.js"],
      "env": {
        "PRIMO_BASE_URL": "https://<your-host>/primaws/rest/pub",
        "PRIMO_VID": "<inst_code>:<view_code>",
        "PRIMO_INSTITUTION_NAME": "Your Uni",
        "PRIMO_DISCOVERY_NAME": "YourDiscoveryName"
      }
    }
  }
}
```

Restart Claude Desktop fully after editing (stdio servers load at startup). The
tools then appear as `primo_search`, `primo_get_record`, and so on.

## Configuration

Configuration comes from environment variables (prefix `PRIMO_`). Precedence,
highest first:

1. The process environment: an `env` block in the MCP config, or a shell export.
2. A `.env` file in the project root (copy `.env.example` to `.env`).
3. The built-in defaults (UWA).

A `.env` file is loaded from the project root regardless of the working
directory, so it works even when Claude Desktop launches the server from
elsewhere. Values set in the process environment are never overridden by `.env`.

### Variables

| Variable | Default | What it is |
|----------|---------|------------|
| `PRIMO_BASE_URL` | `https://onesearch.library.uwa.edu.au/primaws/rest/pub` | Public Primo REST API base: `https://<host>/primaws/rest/pub` |
| `PRIMO_VID` | `61UWA_INST:NDE_UWA` | View ID, `<inst_code>:<view_code>` |
| `PRIMO_INSTITUTION_NAME` | `UWA` | Institution short name |
| `PRIMO_DISCOVERY_NAME` | (institution name) | Discovery brand shown to users, e.g. `OneSearch`, `PittCat` |
| `PRIMO_TAB_EVERYTHING` | `Everything` | Tab for the combined (local + databases) search |
| `PRIMO_TAB_CATALOGUE` | `Catalogue` | Tab for the local-catalogue-only search |
| `PRIMO_SCOPE_COMBINED` | `MyInst_and_CI` | Search scope for local + Central Discovery Index |
| `PRIMO_SCOPE_LOCAL` | `MyInstitution` | Search scope for local records only |
| `PRIMO_REQUEST_TIMEOUT` | `30` | HTTP timeout, in seconds |
| `PRIMO_MAX_RESULTS_PER_REQUEST` | `50` | Hard cap on results per request |
| `PRIMO_DEFAULT_RESULTS` | `10` | Default result count when `limit` is omitted |
| `PRIMO_LANGUAGE` | `en` | UI language code |
| `PRIMO_USER_AGENT` | `primo-mcp-server/0.1.0` | User-Agent sent with requests |

### Finding your Primo settings

The institution-specific values all appear in your library's discovery URL.

1. Open your library's Primo / discovery search and run any search (it can
   return zero results). Look at the browser address bar. It looks like:

   ```
   https://<host>/discovery/search?query=any,contains,test&tab=<TAB>&search_scope=<SCOPE>&vid=<INST>:<VIEW>&offset=0
   ```

2. Read the values off the URL:
   - `vid=...` is your **`PRIMO_VID`** (for example `61UWA_INST:NDE_UWA`, or a
     cloud-hosted one like `01PITT_INST:...`).
   - `<host>` gives your **`PRIMO_BASE_URL`**: `https://<host>/primaws/rest/pub`.
     Ex Libris cloud hosts look like `<inst>.primo.exlibrisgroup.com`; some
     libraries use a custom domain (UWA's is `onesearch.library.uwa.edu.au`).
   - `tab=...` on the default "everything" search is your
     **`PRIMO_TAB_EVERYTHING`**, and `search_scope=...` there is your
     **`PRIMO_SCOPE_COMBINED`** (commonly `MyInst_and_CI`).

3. Switch the search to the local, library-catalogue-only scope (often labelled
   "Library Catalog" or your library's name) and read the URL again: that
   `tab=...` is **`PRIMO_TAB_CATALOGUE`** and that `search_scope=...` is
   **`PRIMO_SCOPE_LOCAL`** (commonly `MyInstitution`).

To be certain of the base URL, open your browser's developer tools, go to the
Network tab, run a search, and find the request to
`.../primaws/rest/pub/pnxs?...`. Its host is your base URL, and its query string
shows the exact `vid`, `tab`, and `search_scope` the interface uses. That
request is the same one this server makes.

Notes:
- The two scope values are the same at many institutions (`MyInst_and_CI` and
  `MyInstitution`); the tab names vary (`Everything`, `ALL`, `LibraryCatalog`,
  and so on), so read them from your own URL rather than assuming.
- `PRIMO_DISCOVERY_NAME` is only cosmetic: it is the name shown in the
  "Check availability in ..." line when an item has no direct link.

## Usage examples

From a conversation:

- "Search the library for articles about machine learning in entrepreneurship
  published after 2020."
- "Get the full details for record `cdi_crossref_primary_10_1234`."
- "Generate APA 7 citations for these records."
- "Export the search results as BibTeX."

## Development

```bash
npm run dev        # run from source with tsx
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

Smoke-test the tools in isolation, without registering the server, with the MCP
inspector:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

## Licence

MIT.
