# primo-mcp-server (Node)

An MCP server for Ex Libris Primo library discovery. It searches a university
catalogue and its subscribed databases (ProQuest, Elsevier, Crossref, Gale,
Springer, IEEE, and so on) over the Model Context Protocol.

This is the Node/TypeScript port. It talks only to Primo's **public** REST API
(the `/primaws/rest/pub` endpoints) with a view ID. There is no per-user login:
search and suggest are fully anonymous, and single-record lookup uses an
anonymous **guest token** the institution issues to any visitor (the same
session token a signed-out browser receives), never a personal login or API
key. This is the same access class as an ordinary catalogue search in a browser.

## Features

- **Search** the catalogue and the Primo Central Index (millions of
  article-level and database records), with filters for field, scope, resource
  type, date range, peer-review, and availability.
- **Get record details**, including abstract, authors, identifiers,
  availability, and, for local physical items, the owning library's holdings
  (call number, shelf location, and status).
- **Autocomplete** search suggestions.
- **Generate citations** in APA 7th, Harvard, Chicago, IEEE, and Vancouver,
  with place of publication rendered per style.
- **Export** to BibTeX, RIS, or CSV for reference managers.

## Before you start

You need two things installed: **Node.js 18 or newer** and **git**. If you have
never set up a Node project before, this section gets you there; if you already
have both, skip to Install and build.

Open a terminal (Terminal on macOS, PowerShell on Windows, your shell on Linux)
and check what you have:

```
node --version
git --version
```

If `node` prints v18 or higher and `git` prints a version, you are set. If
either is missing or Node is older than 18, install it:

- **macOS:** install [Homebrew](https://brew.sh) and run `brew install node git`,
  or download the Node LTS installer from [nodejs.org](https://nodejs.org/) and
  git from [git-scm.com](https://git-scm.com/downloads).
- **Windows:** run the Node LTS installer from [nodejs.org](https://nodejs.org/)
  and [Git for Windows](https://git-scm.com/downloads), then reopen PowerShell.
  Or, with winget: `winget install OpenJS.NodeJS.LTS Git.Git`.
- **Linux:** use your package manager, for example
  `sudo apt install nodejs npm git` on Debian/Ubuntu. If your distribution's
  Node is older than 18, install the current LTS from
  [nodejs.org](https://nodejs.org/) or via [nvm](https://github.com/nvm-sh/nvm).

npm ships with Node, so there is nothing extra to install for it.

## Install and build

Clone the repository, install dependencies, and build:

```
git clone https://github.com/ljferdinand/primo-mcp-server.git
cd primo-mcp-server
npm install
npm run build
```

The build compiles TypeScript into `dist/`; the server entry point is
`dist/index.js`. Re-run `npm run build` after pulling updates.

## Configure for your library

The server has no built-in institution: `PRIMO_BASE_URL` and `PRIMO_VID` are
required, and it exits at startup with a clear message if either is missing. You
can set them in the MCP client's config (shown below) or in a `.env` file in the
project folder:

```
cp .env.example .env
```

Then edit `.env` and fill in at least those two values.

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

`PRIMO_INSTITUTION_CODE`, used by single-record lookup for the guest token, is
derived from the VID prefix automatically; set it only if your guest-token
endpoint uses a different code.

Notes:
- The two scope values are the same at many institutions (`MyInst_and_CI` and
  `MyInstitution`); the tab names vary (`Everything`, `ALL`, `LibraryCatalog`,
  and so on), so read them from your own URL rather than assuming.
- `PRIMO_DISCOVERY_NAME` is only cosmetic: it is the name shown in the
  "Check availability in ..." line when an item has no direct link.

## Connect it to an MCP client

An MCP client is the app that talks to this server, such as Claude Desktop or
Claude Code. If this is your first MCP server, Claude Desktop is the simplest
place to start.

Both clients launch the server with a narrower `PATH` than your shell, so use an
**absolute** path to `node` and to `dist/index.js`. Find your node path with
`which node` (macOS/Linux) or `where node` (Windows PowerShell).

### Claude Desktop

Open (or create) the config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add a `primo` entry alongside any existing servers. `PRIMO_BASE_URL` and
`PRIMO_VID` are required, so set them in an `env` block (or leave them out and
rely on `.env`):

```json
{
  "mcpServers": {
    "primo": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/primo-mcp-server/dist/index.js"],
      "env": {
        "PRIMO_BASE_URL": "https://<your-host>/primaws/rest/pub",
        "PRIMO_VID": "<inst_code>:<view_code>",
        "PRIMO_INSTITUTION_NAME": "Your Library",
        "PRIMO_DISCOVERY_NAME": "YourDiscoveryName"
      }
    }
  }
}
```

On Windows the paths use backslashes, which must be doubled in JSON, so
`command` looks like `C:\\Program Files\\nodejs\\node.exe` and the argument like
`C:\\Users\\you\\primo-mcp-server\\dist\\index.js` (forward slashes also work).
Save the file and **fully quit and reopen Claude Desktop**, since it loads MCP
servers at startup. The tools then appear as `primo_search`, `primo_get_record`,
and so on.

### Claude Code

Add the same server to `~/.claude/settings.json`, again with absolute paths:

```json
{
  "mcpServers": {
    "primo": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/absolute/path/to/primo-mcp-server/dist/index.js"],
      "env": {
        "PRIMO_BASE_URL": "https://<your-host>/primaws/rest/pub",
        "PRIMO_VID": "<inst_code>:<view_code>"
      }
    }
  }
}
```

Restart Claude Code. The tools appear as `mcp__primo__primo_search`, and so on.

## Configuration

Configuration comes from environment variables (prefix `PRIMO_`). Precedence,
highest first:

1. The process environment: an `env` block in the MCP config, or a shell export.
2. A `.env` file in the project root (copy `.env.example` to `.env`).
3. The built-in defaults for the optional variables. `PRIMO_BASE_URL` and
   `PRIMO_VID` have no default and must be provided by 1 or 2; the server exits
   at startup with a clear message if either is missing.

A `.env` file is loaded from the project root regardless of the working
directory, so it works even when Claude Desktop launches the server from
elsewhere. Values set in the process environment are never overridden by `.env`.

### Variables

| Variable | Default | What it is |
|----------|---------|------------|
| `PRIMO_BASE_URL` | **required** | Public Primo REST API base: `https://<host>/primaws/rest/pub` |
| `PRIMO_VID` | **required** | View ID, `<inst_code>:<view_code>` |
| `PRIMO_INSTITUTION_CODE` | (VID prefix) | Institution code for the guest-token endpoint; derived from the VID prefix when unset |
| `PRIMO_INSTITUTION_NAME` | `the library catalogue` | Institution short name; fallback for `PRIMO_DISCOVERY_NAME` |
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
| `PRIMO_INCLUDE_UNAVAILABLE` | `true` | Default for the `include_unavailable` search argument: `true` includes records with no full-text access (Primo's expanded search), `false` restricts to available material |

See `.env.example` for a copy-paste template.

## Tools

| Tool | Description |
|------|-------------|
| `primo_search` | Search the catalogue with optional filters (field, scope, type, date range, peer-reviewed, availability) |
| `primo_get_record` | Full details for one record by ID, including holdings for local physical items |
| `primo_suggest` | Autocomplete suggestions |
| `primo_cite` | Citations in APA 7, Harvard, Chicago, IEEE, or Vancouver, with place of publication per style |
| `primo_export` | Export records as BibTeX, RIS, or CSV |

## Usage examples

From a conversation with your MCP client:

- "Search the library for articles about machine learning in entrepreneurship
  published after 2020."
- "Get the full details for record `cdi_crossref_primary_10_1234`."
- "Generate APA 7 citations for these records."
- "Export the search results as BibTeX."

## Search scope and tactics

A few notes on how Primo behaves through this server that help searches land.

**Scope: `catalogue` versus `everything`.** `catalogue` searches your
institution's local holdings only, so it answers "do we hold this?".
`everything` adds the Central Discovery Index: article-level records and
material from subscribed databases and open sources (HathiTrust and other
aggregators), so besides broad discovery it doubles as a signal for a freely
available digital copy. If your institution runs several libraries on a single
Primo instance, `catalogue` scope spans all of them; results are not limited to
one library, and which library holds an item is shown in the holdings on the
full record.

**Availability: the `include_unavailable` toggle (`primo_search`).** This maps
to Primo's `pcAvailability`. The default is broad and includes records the
institution has no full-text access to; set `include_unavailable: false` to
restrict results to currently-available material. Because this server uses an
unauthenticated guest view, results can under-report what a signed-in affiliate
would see, so the broad default avoids hiding items the institution actually
holds. Narrow it when you specifically want an access-only cut. The default is
configurable with `PRIMO_INCLUDE_UNAVAILABLE`.

**Holdings (`primo_get_record`).** For a local physical item, the record detail
includes a Holdings block: owning library, call number, shelf location, and
status. Search results carry a lighter response and usually do not include
holdings, so fetch the record by ID to see them. Availability and holdings
reflect the anonymous guest view.

**Query tactics.**

- For a work with a non-English title, a `creator`-field search often succeeds
  where a title search returns nothing, because the item may be held only under
  a translated or English title. Try creator-first for foreign-language works.
- Keep the author out of the title field. A title search with a trailing
  surname tends to return zero, because the surname is not in the title index.
- Relevance matching is loose. A single title search can surface look-alikes by
  other authors, and generic titles produce false "held" hits. Recheck
  zero-result and generic-title searches with an author-scoped query before
  concluding whether an item is held.

## Development

```
npm run dev        # run from source with tsx
npm run typecheck  # tsc --noEmit
npm test           # vitest
```

Smoke-test the tools in isolation, without registering the server, with the MCP
inspector:

```
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

## Licence

MIT.
