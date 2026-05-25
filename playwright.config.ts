import { defineConfig, devices } from "@playwright/test"

// Playwright E2E config for OneCamp FE.
//
// Why these choices:
//   - testDir: e2e/  — kept separate from unit tests under lib/ and
//     components/. Vitest scans for *.test.ts(x); Playwright scans only
//     this folder, so the two suites don't collide.
//   - webServer: starts `next dev` on port 3001 (matches the project's
//     existing dev script). On CI we use start (post-build) for closer
//     production parity. reuseExistingServer=true so locally re-running
//     tests doesn't restart Next every time.
//   - Single chromium project for CI to keep wall time low. Local devs
//     can opt into firefox/webkit via the commented-out projects below.
//   - retries on CI because flakey first-paint timeouts on cold starts
//     are common; locally we want immediate failure to surface them.
//
// Run with:
//   pnpm test:e2e         (headless)
//   pnpm test:e2e:ui      (Playwright inspector)

const isCI = !!process.env.CI
const PORT = Number(process.env.PLAYWRIGHT_PORT || 3001)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI, // .only must not land in CI
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Keep navigation timeout tight in non-CI to surface flakes early;
    // CI environments are slower so we let it stretch.
    navigationTimeout: isCI ? 30_000 : 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Uncomment to add cross-browser coverage locally:
    // { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    // { name: "webkit",  use: { ...devices["Desktop Safari"] } },
  ],

  // Boot the FE before the suite runs. On CI we'd typically swap this
  // for `pnpm start` after a build step — see .github/workflows/ci.yml.
  webServer: {
    command: isCI ? "pnpm start -p " + PORT : "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    // Next.js cold start can take a moment with the import dialogs +
    // Tiptap loaded; 120s is a comfortable ceiling.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})
