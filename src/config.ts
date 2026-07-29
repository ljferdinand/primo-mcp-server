/**
 * Configuration for the Primo MCP server (Node port).
 *
 * Defaults are set for UWA (University of Western Australia).
 * Override via environment variables with the PRIMO_ prefix.
 *
 * Institution-first target is PittCat: set PRIMO_BASE_URL and PRIMO_VID
 * (and confirm the tab/scope names, which may differ from UWA's) to point
 * at Pitt.
 */

export interface PrimoConfig {
  // Institution-specific
  baseUrl: string;
  vid: string;
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

export function loadConfig(): PrimoConfig {
  const institutionName = envStr("INSTITUTION_NAME", "UWA");

  // PRIMO_REQUEST_TIMEOUT is expressed in seconds (parity with the Python
  // .env.example); stored internally as milliseconds for fetch/AbortController.
  const timeoutSeconds = envNum("REQUEST_TIMEOUT", 30);

  return {
    baseUrl: envStr(
      "BASE_URL",
      "https://onesearch.library.uwa.edu.au/primaws/rest/pub",
    ),
    vid: envStr("VID", "61UWA_INST:NDE_UWA"),
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
