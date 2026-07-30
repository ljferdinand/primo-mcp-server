// Global test setup. PRIMO_BASE_URL and PRIMO_VID are required at config load
// (decision 6: no built-in defaults), so provide throwaway values here. The
// unit tests assert request shape and parsing, not the target institution, so
// the specific values do not matter. Real environment values, if set, win.
process.env.PRIMO_BASE_URL ??= "https://test.primo.example/primaws/rest/pub";
process.env.PRIMO_VID ??= "01TEST_INST:TEST_VIEW";
