import { defineConfig, devices } from "@playwright/test"

// The COOKIE-SCOPE e2e, run by e2e/cookieScope/run.sh inside browser-isolated:
// every *.ws.test host is this namespace's TLS front (hostProxy.mjs), whose
// certificate is made for the run.
export default defineConfig({
  testDir: ".",
  testMatch: /twoWorkspaces\.spec\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  outputDir: process.env.WORK ? `${process.env.WORK}/playwright` : undefined,
  use: {
    ...devices["Desktop Chrome"],
    ignoreHTTPSErrors: true,
    launchOptions: { args: ["--host-resolver-rules=MAP *.ws.test 127.0.0.1"] },
    // Off: a trace records request headers, and these carry session cookies.
    trace: "off",
    navigationTimeout: 60_000,
  },
})
