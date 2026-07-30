import { describe, it, expect, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

// PittCat build: every value has a built-in default, so nothing is required and
// loadConfig never throws. These tests delete the throwaway vars that
// tests/setup.ts provides, then check the baked-in defaults and overrides.
const TOUCHED = [
  "PRIMO_BASE_URL",
  "PRIMO_VID",
  "PRIMO_INSTITUTION_NAME",
  "PRIMO_DISCOVERY_NAME",
  "PRIMO_TAB_CATALOGUE",
] as const;

describe("loadConfig (PittCat build)", () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of TOUCHED) saved[k] = process.env[k];

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("applies the built-in PittCat defaults when nothing is set", () => {
    for (const k of TOUCHED) delete process.env[k];

    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe(
      "https://pitt.primo.exlibrisgroup.com/primaws/rest/pub",
    );
    expect(cfg.vid).toBe("01PITT_INST:01PITT_INST");
    expect(cfg.institutionName).toBe("University of Pittsburgh");
    expect(cfg.discoveryName).toBe("PittCat");
    expect(cfg.tabCatalogue).toBe("LibraryCatalog");
    // institutionCode is empty; the client derives it from the VID prefix.
    expect(cfg.institutionCode).toBe("");
  });

  it("does not require any variable (no fail-fast on this build)", () => {
    delete process.env.PRIMO_BASE_URL;
    delete process.env.PRIMO_VID;
    expect(() => loadConfig()).not.toThrow();
  });

  it("lets the environment override a baked-in default", () => {
    process.env.PRIMO_BASE_URL = "https://x.primo.example/primaws/rest/pub";
    process.env.PRIMO_VID = "01X_INST:X_VIEW";
    process.env.PRIMO_DISCOVERY_NAME = "OtherCat";

    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe("https://x.primo.example/primaws/rest/pub");
    expect(cfg.vid).toBe("01X_INST:X_VIEW");
    expect(cfg.discoveryName).toBe("OtherCat");
  });
});
