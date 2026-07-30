/**
 * Configuration for the Primo MCP server (PittCat build).
 *
 * This build ships with University of Pittsburgh / PittCat values as the
 * built-in defaults, so the server runs with no configuration. Every value is
 * optional and overridable via a PRIMO_-prefixed environment variable; set
 * PRIMO_BASE_URL and PRIMO_VID to point the server at a different Primo view.
 * (Deliberate, branch-scoped reversal of the canonical build's no-defaults
 * policy; the canonical build on main requires those two and has no defaults.)
 */

export interface PrimoConfig {
  // Institution-specific
  baseUrl: string;
  vid: string;
  /**
   * Institution code for the guest-token endpoint, e.g. "01PITT_INST".
   * Optional: when unset, it is derived from the VID prefix (the part before
   * the first colon), which is correct for standard Primo VE view IDs.
   */
  institutionCode: string;
  institutionName: string;
  /** Discovery brand shown to users, e.g. "PittCat". */
  discoveryName: string;
  tabEverything: string;
  tabCatalogue: string;
  scopeCombined: string;
  scopeLocal: string;

  // Operational
  requestTimeoutMs: number;
  maxResultsPerRequest: number;
  defaultResults: number;
  language: string;
  userAgent: string;
  /**
   * Default for Primo's pcAvailability search parameter. When true the search
   * is "expanded" and includes records the institution has no full-text access
   * to; when false it is restricted to currently-available material. Defaults
   * to true; a per-call include_unavailable argument overrides it. Set
   * PRIMO_INCLUDE_UNAVAILABLE to "false" to make restricted-to-available the
   * default.
   */
  includeUnavailable: boolean;
}

/**
 * Retained for API compatibility with the canonical build (index.ts imports it
 * for its startup catch). The PittCat build has defaults for every value, so
 * loadConfig does not throw it.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function envStr(name: string, fallback: string): string {
  const v = process.env[`PRIMO_${name}`];
  return v !== undefined && v.trim() !== "" ? v : fallback;
}

function envNum(name: string, fallback: number): number {
  const v = process.env[`PRIMO_${name}`];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[`PRIMO_${name}`];
  if (v === undefined || v.trim() === "") return fallback;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
  if (s === "false" || s === "0" || s === "no" || s === "off") return false;
  return fallback;
}

export function loadConfig(): PrimoConfig {
  const institutionName = envStr("INSTITUTION_NAME", "University of Pittsburgh");

  // PRIMO_REQUEST_TIMEOUT is expressed in seconds (parity with the
  // .env.example); stored internally as milliseconds for fetch/AbortController.
  const timeoutSeconds = envNum("REQUEST_TIMEOUT", 30);

  return {
    // PittCat defaults; override with PRIMO_BASE_URL / PRIMO_VID for another view.
    baseUrl: envStr(
      "BASE_URL",
      "https://pitt.primo.exlibrisgroup.com/primaws/rest/pub",
    ),
    vid: envStr("VID", "01PITT_INST:01PITT_INST"),
    // Empty by default: the client derives it from the VID prefix
    // ("01PITT_INST"). Set PRIMO_INSTITUTION_CODE only if the guest-token
    // institution code differs from the VID prefix.
    institutionCode: envStr("INSTITUTION_CODE", ""),
    institutionName,
    discoveryName: envStr("DISCOVERY_NAME", "PittCat"),
    tabEverything: envStr("TAB_EVERYTHING", "Everything"),
    tabCatalogue: envStr("TAB_CATALOGUE", "LibraryCatalog"),
    scopeCombined: envStr("SCOPE_COMBINED", "MyInst_and_CI"),
    scopeLocal: envStr("SCOPE_LOCAL", "MyInstitution"),
    requestTimeoutMs: Math.round(timeoutSeconds * 1000),
    maxResultsPerRequest: envNum("MAX_RESULTS_PER_REQUEST", 50),
    defaultResults: envNum("DEFAULT_RESULTS", 10),
    language: envStr("LANGUAGE", "en"),
    userAgent: envStr("USER_AGENT", "primo-mcp-server/0.1.0"),
    includeUnavailable: envBool("INCLUDE_UNAVAILABLE", true),
  };
}
