import { describe, it, expect, afterEach } from "vitest";
import { loadConfig, ConfigError } from "../src/config.js";

const TOUCHED = [
  "PRIMO_BASE_URL",
  "PRIMO_VID",
  "PRIMO_INSTITUTION_NAME",
  "PRIMO_DISCOVERY_NAME",
] as const;

describe("loadConfig", () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of TOUCHED) saved[k] = process.env[k];

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("loads when the required vars are set and applies neutral defaults", () => {
    process.env.PRIMO_BASE_URL = "https://x.primo.example/primaws/rest/pub";
    process.env.PRIMO_VID = "01X_INST:X_VIEW";
    delete process.env.PRIMO_INSTITUTION_NAME;
    delete process.env.PRIMO_DISCOVERY_NAME;

    const cfg = loadConfig();
    expect(cfg.baseUrl).toBe("https://x.primo.example/primaws/rest/pub");
    expect(cfg.vid).toBe("01X_INST:X_VIEW");
    expect(cfg.institutionName).toBe("the library catalogue");
    // discoveryName falls back to institutionName when unset.
    expect(cfg.discoveryName).toBe("the library catalogue");
    // institutionCode is empty; the client derives it from the VID prefix.
    expect(cfg.institutionCode).toBe("");
  });

  it("throws ConfigError naming the missing required vars", () => {
    delete process.env.PRIMO_BASE_URL;
    delete process.env.PRIMO_VID;
    let error: unknown;
    try {
      loadConfig();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const msg = (error as Error).message;
    expect(msg).toContain("PRIMO_BASE_URL");
    expect(msg).toContain("PRIMO_VID");
  });
});
