# primo-mcp-server

MCP server for Ex Libris Primo library discovery -- search a university catalogue and its subscribed databases (ProQuest, Elsevier, Crossref, Gale, Springer, IEEE, and so on) from any Model Context Protocol client.

## Features

- **Search** the catalogue and the Primo Central Index (millions of records)
- **Get record details**, including abstract, authors, identifiers, availability, and the owning library's holdings (call number, shelf location, status) for physical items
- **Autocomplete** search suggestions
- **Generate citations** in APA 7th, Harvard, Chicago, IEEE, and Vancouver, with place of publication rendered per style
- **Export** to BibTeX, RIS, or CSV for reference managers

It talks only to Primo's public REST API. Search and suggest are anonymous; single-record lookup uses an anonymous guest token the institution issues to any visitor (the same session token a signed-out browser receives), never a personal login or API key.

## Before you start

You need two things installed: **Python 3.11 or newer** and **git**. If you have never set up a Python project before, this section gets you there; if you already have both, skip to Installation.

**Python.** Check whether you already have it:

```
python --version
```

If that prints 3.11 or higher, you are set. If not, or the command is not found:

- **Windows:** install from [python.org/downloads](https://www.python.org/downloads/) and tick "Add python.exe to PATH" in the installer, or run `winget install Python.Python.3.12`.
- **macOS:** install from [python.org/downloads](https://www.python.org/downloads/), or with [Homebrew](https://brew.sh) run `brew install python`.
- **Linux:** use your package manager, e.g. `sudo apt install python3 python3-venv python3-pip` on Debian/Ubuntu.

**git.** Check with `git --version`. If it is missing, get it from [git-scm.com/downloads](https://git-scm.com/downloads) (or `winget install Git.Git`, `brew install git`, or your package manager).

> Prefer a single tool that manages Python versions and environments for you? [uv](https://docs.astral.sh/uv/) works well and is shown as a shortcut at the end of Installation.

## Installation

Clone the repository and open the folder:

```
git clone https://github.com/geheharidas/primo-mcp-server.git
cd primo-mcp-server
```

Create an isolated environment (a "virtual environment") so this project's packages do not mix with the rest of your system, activate it, and install the server into it:

```
# create the environment (once)
python -m venv .venv

# activate it (do this in each new terminal)
#   macOS / Linux:
source .venv/bin/activate
#   Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# install the server and its dependencies
pip install -e .
```

Once activated, your prompt shows `(.venv)`. The `-e` installs in "editable" mode, so pulling updates takes effect without reinstalling.

**Shortcut with uv.** If you installed uv, it handles the Python version, the environment, and the dependencies in one step from the project folder: `uv sync`. Prefix later commands with `uv run` (for example, `uv run pytest`).

## Configure for your library

Out of the box the server points at UWA (University of Western Australia). To use your own library, set at least `PRIMO_BASE_URL` and `PRIMO_VID`. The easiest way is a `.env` file in the project folder:

```
cp .env.example .env
```

Then edit `.env` and set the values for your institution.

**Finding your values.** Open your library's Primo / discovery site and run any search (it can return nothing). The browser address bar looks like:

```
https://<host>/discovery/search?query=any,contains,test&tab=<TAB>&search_scope=<SCOPE>&vid=<INST>:<VIEW>
```

- `vid=...` is your **`PRIMO_VID`** (for example, `01ABC_INST:ABC`).
- `<host>` gives your **`PRIMO_BASE_URL`**: `https://<host>/primaws/rest/pub`.
- `tab=...` and `search_scope=...` on the default search are `PRIMO_TAB_EVERYTHING` and `PRIMO_SCOPE_COMBINED`. Switch to the local catalogue scope and read them again for `PRIMO_TAB_CATALOGUE` and `PRIMO_SCOPE_LOCAL` (these are commonly `MyInst_and_CI` and `MyInstitution`).

`PRIMO_INSTITUTION_CODE`, used by single-record lookup for the guest token, is derived from the VID prefix automatically; set it only if your guest-token endpoint uses a different code. See the Configuration table for the full list.

## Connect it to an MCP client

An MCP client is the app that talks to this server, such as Claude Desktop or Claude Code. If this is your first MCP server, Claude Desktop is the simplest place to start.

You will need the **absolute path to the Python inside your `.venv`**, because the client launches the server with a narrower environment than your shell. With the environment activated, print it:

```
python -c "import sys; print(sys.executable)"
```

### Claude Desktop

Open (or create) the config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add a `primo` entry using the absolute Python path you printed. Put any institution overrides in `env`, or leave them out and rely on the `.env` file:

```json
{
  "mcpServers": {
    "primo": {
      "command": "/absolute/path/to/primo-mcp-server/.venv/bin/python",
      "args": ["-m", "primo_mcp_server"],
      "env": {
        "PRIMO_BASE_URL": "https://<your-host>/primaws/rest/pub",
        "PRIMO_VID": "<inst_code>:<view_code>",
        "PRIMO_INSTITUTION_NAME": "Your Library"
      }
    }
  }
}
```

On Windows the `command` looks like `C:\\path\\to\\primo-mcp-server\\.venv\\Scripts\\python.exe` (double the backslashes in JSON). Save the file and **fully quit and reopen Claude Desktop**, since it loads MCP servers at startup. The Primo tools then appear in the client.

### Claude Code

Add to `~/.claude/settings.json`, again with the absolute venv Python:

```json
{
  "mcpServers": {
    "primo": {
      "command": "/absolute/path/to/primo-mcp-server/.venv/bin/python",
      "args": ["-m", "primo_mcp_server"]
    }
  }
}
```

Restart Claude Code. The tools appear as `mcp__primo__primo_search`, and so on.

## Tools

| Tool | Description |
|------|-------------|
| `primo_search` | Search the catalogue with filters (type, date range, peer-reviewed) |
| `primo_get_record` | Full details for a record by ID, including holdings for physical items |
| `primo_suggest` | Autocomplete search suggestions |
| `primo_cite` | Citations in APA 7th, Harvard, Chicago, IEEE, or Vancouver |
| `primo_export` | Export records as BibTeX, RIS, or CSV |

## Usage examples

From a conversation with your MCP client:

- "Search the library for articles about machine learning in entrepreneurship published after 2020"
- "Get the full details for record cdi_crossref_primary_10_1234"
- "Generate APA 7 citations for these records"
- "Export the search results as BibTeX"

## Configuration

Defaults are set for UWA. Override via environment variables, in the client's `env` block, a `.env` file, or your shell:

| Variable | Default | Description |
|----------|---------|-------------|
| `PRIMO_BASE_URL` | `https://onesearch.library.uwa.edu.au/primaws/rest/pub` | Primo public REST API base |
| `PRIMO_VID` | `61UWA_INST:NDE_UWA` | Primo View ID, `<inst_code>:<view_code>` |
| `PRIMO_INSTITUTION_CODE` | (VID prefix) | Institution code for the guest-token endpoint; derived from the VID prefix when unset |
| `PRIMO_INSTITUTION_NAME` | `UWA` | Display name |
| `PRIMO_TAB_EVERYTHING` | `Everything` | Tab for the combined (catalogue + databases) search |
| `PRIMO_TAB_CATALOGUE` | `Catalogue` | Tab for the local-catalogue search |
| `PRIMO_SCOPE_COMBINED` | `MyInst_and_CI` | Scope for local + Central Discovery Index |
| `PRIMO_SCOPE_LOCAL` | `MyInstitution` | Scope for local records only |
| `PRIMO_REQUEST_TIMEOUT` | `30.0` | HTTP timeout in seconds |
| `PRIMO_MAX_RESULTS_PER_REQUEST` | `50` | Maximum results per search |
| `PRIMO_DEFAULT_RESULTS` | `10` | Default results per search |
| `PRIMO_LANGUAGE` | `en` | UI language code |

See `.env.example` for a copy-paste template.

## Running tests

```
pip install -e ".[dev]"
pytest
```

(With uv: `uv run --extra dev pytest`.)

## Licence

MIT
