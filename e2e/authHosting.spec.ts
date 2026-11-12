import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// The sign-in page says where the workspace runs (SHELL-05), in a real browser
// with no backend. The public demo's sign-in page used to say "self-hosted,
// your data stays on this server" to a stranger who shares it with every
// other visitor; OneCamp Cloud's said it too. The public sign-in answer now
// carries hosting, and the trust line and the camp's chip claim only that:
// nothing before the server answers, or from a server too old to say.
// The first run's caption under the camp says it the same way. With
// SHOTS_DIR=<dir> each server's pages are saved at 1280 and 390, light and dark.

/** Every claim the trust line can make: none shows unless the server said it. */
const CLAIMS = /self-hosted|stays on this server|run by OneMana|Shared demo/

const SERVERS = [
  // The demo's two words alone: its button's hint already says it starts over every night.
  { hosting: "demo", line: "Shared demo", chip: "Demo server" },
  { hosting: "cloud", line: "run by OneMana for your team", chip: "OneMana Cloud" },
  { hosting: "self", line: "self-hosted, your data stays on this server", chip: "Your server" },
  // A server too old to say: the address alone, with no shield and no chip.
  { hosting: undefined, line: null, chip: null },
] as const

const answer = (hosting?: string) => ({
  status: "success",
  providers: { email: true, demo: true },
  email_configured: true,
  workspace_name: "",
  ...(hosting ? { hosting } : {}),
})

async function signedOut(page: Page, testInfo: TestInfo, providers: unknown, at = "/") {
  await stubBackend(page, testInfo, {
    "/user/profile": withStatus(401, { msg: "Not signed in" }),
    "/refreshToken": withStatus(401, { msg: "Not signed in" }),
    "/auth/admin-setup-required": { required: at === "/admin-setup" },
    "/auth/providers": providers,
  })
  await page.goto(at, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const VIEWS = [
  ["at 1280", { viewport: { width: 1280, height: 860 } }],
  ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const

for (const theme of SHOT_THEMES) {
  for (const [label, use] of VIEWS) {
    test.describe(`where the workspace runs, ${label}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      for (const { hosting, line, chip } of SERVERS) {
        test(`a ${hosting ?? "silent"} server's sign-in claims ${line ? "only that" : "nothing"}`, async ({ page }, testInfo) => {
          test.setTimeout(120_000)
          await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
          await signedOut(page, testInfo, answer(hosting))
          const trust = page.locator("[data-trust-line]")
          const chips = page.locator("[data-claim='server']")
          const host = new URL(page.url()).host
          // The line's words exactly, and from a silent server the host with no dot left hanging.
          const said = trust.locator(":scope > span").first()
          if (line) {
            await expect(trust).toContainText(line, { timeout: 60_000 })
            await expect(said).toHaveText(hosting === "demo" ? line : `${host} · ${line}`)
            // The one claim made: the demo never says your server, Cloud never self-hosted.
            for (const other of SERVERS) if (other.line && other.line !== line) await expect(trust).not.toContainText(other.line)
            await expect(trust.locator("svg")).toHaveCount(hosting === "demo" ? 0 : 1)
          } else {
            await expect(trust).toContainText(host, { timeout: 60_000 })
            await expect(said).toHaveText(host)
            await expect(trust).not.toContainText(CLAIMS)
            await expect(trust.locator("svg")).toHaveCount(0)
          }
          // The camp beside the form shows from 1024 px up (a phone has it in the page, hidden); its
          // chip names only what the server said, and none at all when it said nothing. Its
          // shield goes with the trust line's: none on the demo.
          if (!chip) await expect(chips).toHaveCount(0)
          else {
            await expect(chips.locator("svg")).toHaveCount(hosting === "demo" ? 0 : 1)
            if (use.viewport.width >= 1024) {
              await expect(chips).toBeVisible()
              await expect(chips).toContainText(chip)
            } else await expect(chips).toBeHidden()
          }
          await reviewShot(page, `auth-hosting-${hosting ?? "silent"}`, theme)
        })
      }
    })
  }
}

// The first run's caption under the camp (DB-138 F1): "<host> · on your server",
// "<host> · set up by OneMana", "Shared demo", or the host alone. The camp shows
// from 1024 px up; a phone has it in the page, hidden, with its band in its place.
const FIRST_RUN = [
  { hosting: "self", caption: (host: string) => `${host} · on your server` },
  { hosting: "cloud", caption: (host: string) => `${host} · set up by OneMana` },
  { hosting: "demo", caption: () => "Shared demo" },
  { hosting: undefined, caption: (host: string) => host },
] as const

for (const theme of SHOT_THEMES) {
  for (const [label, use] of VIEWS) {
    test.describe(`the first run says where it runs, ${label}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      for (const { hosting, caption } of FIRST_RUN) {
        test(`a ${hosting ?? "silent"} server's first run captions its camp with ${hosting ? "that" : "the host alone"}`, async ({ page }, testInfo) => {
          test.setTimeout(120_000)
          await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
          await signedOut(page, testInfo, answer(hosting), "/admin-setup")
          await expect(page.getByLabel("Your email")).toBeVisible({ timeout: 60_000 })
          const line = page.locator("[data-first-run-camp] .auth-caption")
          await expect(line).toHaveText(caption(new URL(page.url()).host), { timeout: 60_000 })
          if (use.viewport.width >= 1024) await expect(line).toBeVisible()
          else {
            // A phone's frame shows where it runs in the trust line at the foot of the form.
            await expect(line).toBeHidden()
            await page.locator("[data-trust-line]").scrollIntoViewIfNeeded()
          }
          await reviewShot(page, `admin-setup-hosting-${hosting ?? "silent"}`, theme)
        })
      }
    })
  }
}

for (const [label, use] of VIEWS) {
  test.describe(`before the server answers, ${label}`, () => {
    test.use(use)

    test("the sign-in claims nothing until the server says where it runs", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      let tell = () => {}
      const told = new Promise<void>((resolve) => (tell = resolve))
      await signedOut(page, testInfo, async () => {
        await told
        return answer("self")
      })
      const trust = page.locator("[data-trust-line]")
      await expect(trust).toContainText(new URL(page.url()).host, { timeout: 60_000 })
      await expect(trust).not.toContainText(CLAIMS)
      await expect(trust.locator("svg")).toHaveCount(0)
      await expect(page.locator("[data-claim='server']")).toHaveCount(0)

      tell()
      await expect(trust).toContainText("self-hosted, your data stays on this server", { timeout: 60_000 })
      if (use.viewport.width >= 1024) await expect(page.locator("[data-claim='server']")).toContainText("Your server")
    })
  })
}
