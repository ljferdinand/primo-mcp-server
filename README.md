# primo-mcp-server (PittCat build)

An MCP server for searching **PittCat**, the University of Pittsburgh Library
System's Ex Libris Primo discovery service, and its subscribed databases
(ProQuest, Elsevier, Crossref, Gale, Springer, IEEE, and so on) over the Model
Context Protocol.

This is the Pitt-defaulted build. PittCat's settings are baked in, so it runs
with **no configuration**: install, build, point your MCP client at it, and the
tools work. It talks only to Primo's **public** REST API with a view ID and an
anonymous **guest token** (the same session token a signed-out browser
receives), never a personal login or API key. This is the same access class as
an ordinary catalogue search in a browser. (For a different institution, every
value is overridable; see Configuration.)

## Features

- **Search** PittCat and the Primo Central Index (millions of article-level and
  database records), with filters for field, scope, resource type, date range,
  peer-review, and availability.
- **Get record details**, including abstract, authors, identifiers,
  availability, and, for local physical items, the owning library's holdings
  (call number, shelf location, and status) across ULS and HSLS/Falk.
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

Clone this branch, install dependencies, and build:

```
git clone -b pitt-defaults https://github.com/ljferdinand/primo-mcp-server.git
cd primo-mcp-server
npm install
npm run build
```

The build compiles TypeScript into `dist/`; the server entry point is
`dist/index.js`. Re-run `npm run build` after pulling updates.

## Connect it to an MCP client

An MCP client is the app that talks to this server, such as Claude Desktop or
Claude Code. Because the PittCat defaults are built in, **no `env` block is
needed**. If this is your first MCP server, Claude Desktop is the simplest place
to start.

Both clients launch the server with a narrower `PATH` than your shell, so use an
**absolute** path to `node` and to `dist/index.js`. Find your node path with
`which node` (macOS/Linux) or `where node` (Windows PowerShell).

### Claude Desktop

Open (or create) the config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\\Claude\\claude_desktop_config.json`

Add a `primo` entry alongside any existing servers. No environment variables are
required:

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

On Windows, use forward slashes in the JSON paths (they work and avoid escaping
headaches), for example `C:/Users/you/primo-mcp-server/dist/index.js`; if you
prefer backslashes, double them. Save the file and **fully quit and reopen
Claude Desktop**, since it loads MCP servers at startup. The tools then appear
as `primo_search`, `primo_get_record`, and so on.

### Claude Code

Add the same server to `~/.claude/settings.json`, again with absolute paths and
no env block:

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

Restart Claude Code. The tools appear as `mcp__primo__primo_search`, and so on.

## Usage examples

From a conversation with your MCP client:

- "Search PittCat for articles about machine learning in entrepreneurship
  published after 2020."
- "Get the full details for record `cdi_crossref_primary_10_1234`."
- "Generate APA 7 citations for these records."
- "Export the search results as BibTeX."

## Search scope and tactics

A few notes on how Primo behaves through this server that help searches land.

**Scope: `catalogue` versus `everything`.** `catalogue` searches Pitt's local
holdings only, so it answers "do we hold this?". It spans all libraries on the
PittCat instance (ULS together with HSLS/Falk), so results are not limited to
one library, and which library holds an item is shown in the holdings on the
full record. `everything` adds the Central Discovery Index: article-level
records and material from subscribed databases and open sources (HathiTrust and
other aggregators), so besides broad discovery it doubles as a signal for a
freely available digital copy.

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

## Configuration

This build needs no configuration. Every setting is an environment variable
(prefix `PRIMO_`) with a PittCat default; set one only to override it.
Precedence, highest first:

1. The process environment: an `env` block in the MCP config, or a shell export.
2. A `.env` file in the project root (copy `.env.example` to `.env`).
3. The built-in PittCat defaults.

A `.env` file is loaded from the project root regardless of the working
directory, so it works even when Claude Desktop launches the server from
elsewhere. Values set in the process environment are never overridden by `.env`.

### Variables

| Variable | Default (PittCat) | What it is |
|----------|-------------------|------------|
| `PRIMO_BASE_URL` | `https://pitt.primo.exlibrisgroup.com/primaws/rest/pub` | Public Primo REST API base |
| `PRIMO_VID` | `01PITT_INST:01PITT_INST` | View ID, `<inst_code>:<view_code>` |
| `PRIMO_INSTITUTION_CODE` | (VID prefix, `01PITT_INST`) | Institution code for the guest-token endpoint; derived from the VID prefix when unset |
| `PRIMO_INSTITUTION_NAME` | `University of Pittsburgh` | Institution short name |
| `PRIMO_DISCOVERY_NAME` | `PittCat` | Discovery brand shown to users |
| `PRIMO_TAB_EVERYTHING` | `Everything` | Tab for the combined (local + databases) search |
| `PRIMO_TAB_CATALOGUE` | `LibraryCatalog` | Tab for the local-catalogue-only search |
| `PRIMO_SCOPE_COMBINED` | `MyInst_and_CI` | Search scope for local + Central Discovery Index |
| `PRIMO_SCOPE_LOCAL` | `MyInstitution` | Search scope for local records only |
| `PRIMO_REQUEST_TIMEOUT` | `30` | HTTP timeout, in seconds |
| `PRIMO_MAX_RESULTS_PER_REQUEST` | `50` | Hard cap on results per request |
| `PRIMO_DEFAULT_RESULTS` | `10` | Default result count when `limit` is omitted |
| `PRIMO_LANGUAGE` | `en` | UI language code |
| `PRIMO_USER_AGENT` | `primo-mcp-server/0.1.0` | User-Agent sent with requests |
| `PRIMO_INCLUDE_UNAVAILABLE` | `true` | Default for the `include_unavailable` search argument |

### Pointing at a different Primo view

To use this server against another institution's Primo, override at least
`PRIMO_BASE_URL` and `PRIMO_VID` (and usually the tab/scope names). The values
all appear in that library's discovery URL:

```
https://<host>/discovery/search?query=any,contains,test&tab=<TAB>&search_scope=<SCOPE>&vid=<INST>:<VIEW>
```

- `vid=...` is `PRIMO_VID`.
- `<host>` gives `PRIMO_BASE_URL`: `https://<host>/primaws/rest/pub`.
- `tab=...` and `search_scope=...` on the default search are
  `PRIMO_TAB_EVERYTHING` and `PRIMO_SCOPE_COMBINED`; switch to the local
  catalogue scope and read them again for `PRIMO_TAB_CATALOGUE` and
  `PRIMO_SCOPE_LOCAL`.

For an institution-neutral build with no baked-in defaults, use the `main`
branch instead.

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
