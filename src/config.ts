/**
 * Configuration for the Primo MCP server (Node port).
 *
 * PRIMO_BASE_URL and PRIMO_VID are required and have no defaults; loadConfig
 * throws a ConfigError naming any that are missing, so the server fails fast at
 * startup with an actionable message. The remaining values are optional and
 * fall back to the defaults below (the tab/scope names use the common Primo VE
 * values; confirm them against your own view if it differs). Override any value
 * via environment variables with the PRIMO_ prefix.
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
  /** Discovery brand shown to users, e.g. "OneSearch", "PittCat". */
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
}

/** Thrown when required configuration is missing, for a clean startup error. */
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

/** Read a required PRIMO_ variable, recording it as missing if unset/empty. */
function envRequired(name: string, missing: string[]): string {
  const v = process.env[`PRIMO_${name}`];
  if (v !== undefined && v.trim() !== "") return v;
  missing.push(`PRIMO_${name}`);
  return "";
}

export function loadConfig(): PrimoConfig {
  const missing: string[] = [];
  const baseUrl = envRequired("BASE_URL", missing);
  const vid = envRequired("VID", missing);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required configuration: ${missing.join(", ")}. ` +
        "Set them to your institution's Primo values before starting the server. " +
        "PRIMO_BASE_URL is your Primo VE public API base ending in /primaws/rest/pub; " +
        "PRIMO_VID is your view ID, e.g. 01INST_CODE:VIEW_CODE. " +
        'See "Finding your Primo settings" in the README for how to read both off your discovery URL.',
    );
  }

  const institutionName = envStr("INSTITUTION_NAME", "the library catalogue");

  // PRIMO_REQUEST_TIMEOUT is expressed in seconds (parity with the Python
  // .env.example); stored internally as milliseconds for fetch/AbortController.
  const timeoutSeconds = envNum("REQUEST_TIMEOUT", 30);

  return {
    baseUrl,
    vid,
    // Empty by default: the client derives it from the VID prefix. Set
    // PRIMO_INSTITUTION_CODE only if your guest-token institution code
    // differs from the VID prefix.
    institutionCode: envStr("INSTITUTION_CODE", ""),
    institutionName,
    // Defaults to the institution name per the 2026-07-28 decision;
    // set PRIMO_DISCOVERY_NAME to the discovery brand (e.g. "PittCat").
    discoveryName: envStr("DISCOVERY_NAME", institutionName),
    tabEverything: envStr("TAB_EVERYTHING", "Everything"),
    tabCatalogue: envStr("TAB_CATALOGUE", "Catalogue"),
    scopeCombined: envStr("SCOPE_COMBINED", "MyInst_and_CI"),
    scopeLocal: envStr("SCOPE_LOCAL", "MyInstitution"),
    requestTimeoutMs: Math.round(timeoutSeconds * 1000),
    maxResultsPerRequest: envNum("MAX_RESULTS_PER_REQUEST", 50),
    defaultResults: envNum("DEFAULT_RESULTS", 10),
    language: envStr("LANGUAGE", "en"),
    userAgent: envStr("USER_AGENT", "primo-mcp-server/0.1.0"),
  };
}
