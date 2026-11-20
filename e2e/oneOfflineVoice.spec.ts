import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp, setOffline } from "../scripts/fluidity/fakeApp.mjs"
import { docFromBlocks, launchPlanBlocks } from "../scripts/fluidity/fakeCollab.mjs"

// A doc page says it's offline once (V-695): the doc's own pill speaks, and
// the app's connection pill and the header dot's spoken copy yield to it, so
// there is one live region saying offline. Back online, the app's pill asks
// the server at once and says "Reconnecting…" meanwhile, never a false "Can't
// reach the server" (V-696). The server first stops answering while the
// network is up, so the app counts it unreachable before the network goes, as
// a page that kept asking does. With SHOTS_DIR set, saved for review.

const PLAN = "d0c00000-0000-4000-8000-000000000001"
const EDITABLE = '.doc-editor .ProseMirror[contenteditable="true"]'

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} satisfies Record<string, BrowserContextOptions>

/** The app's pill, wherever it's drawn: every connection pill outside the doc's view. */
const APP_PILL = "[data-connection-pill]:not([data-doc-view] *)"

/** Every live region on the page that says offline, by its words. */
const offlineVoices = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')]
      .map((n) => n.textContent?.trim() ?? "")
      .filter((words) => /offline/i.test(words)),
  )

/** The app pill's words every 100 ms for `ms`: "" while it's not drawn. */
const appPillWords = (page: Page, ms: number) =>
  page.evaluate(
    ([selector, ms]) =>
      new Promise<string[]>((resolve) => {
        const seen: string[] = []
        const look = () => seen.push(document.querySelector(selector)?.textContent?.trim() ?? "")
        look()
        const every = window.setInterval(look, 100)
        window.setTimeout(() => {
          window.clearInterval(every)
          resolve(seen)
        }, ms)
      }),
    [APP_PILL, ms] as const,
  )

for (const [device, use] of Object.entries(DEVICES)) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`on a ${device} (${colorScheme}), a doc offline says so once, and back online never says it can't reach the server`, async ({ browser }) => {
      test.setTimeout(120_000)
      const app = String(test.info().project.use.baseURL)
      const plan = docFromBlocks(launchPlanBlocks(), { epoch: "E1" })
      const doc = { id: PLAN, title: "Q4 launch plan", html: plan.html, update: plan.update, levels: { sam: "full" } }
      const collab = collabFor([doc])
      const context = await browser.newContext({ ...use, colorScheme, serviceWorkers: "block" })
      await fakeApp(context, { app, user: USERS.sam, docs: [doc], collab })
      const page = await context.newPage()

      // The server stops answering while the network is up: requests that leave the app get no answer.
      let serverDown = false
      const appOrigin = new URL(app).origin
      await page.route((url) => url.origin !== appOrigin, (route) => (serverDown ? route.abort("connectionrefused") : route.fallback()))

      await page.goto(`/app/doc/${PLAN}`)
      await expect(page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
      const gotIt = page.getByRole("button", { name: "Got it" })
      await gotIt.waitFor({ timeout: 5_000 }).then(() => gotIt.click(), () => undefined)

      // The page asks again when it gets the focus; those reads get no answer, so the app counts the server unreachable.
      serverDown = true
      await expect
        .poll(
          async () => {
            await page.evaluate(() => window.dispatchEvent(new Event("focus")))
            return page.locator(APP_PILL).textContent({ timeout: 1_000 }).catch(() => "")
          },
          { timeout: 30_000, intervals: [500, 1_000, 2_000, 6_000] },
        )
        .toContain("Can't reach the server")

      await setOffline(context, true)
      await expect(page.locator('[data-doc-view] [role="status"][data-connection-pill="offline"]')).toBeVisible({ timeout: 15_000 })
      await expect.poll(() => offlineVoices(page), { timeout: 5_000 }).toHaveLength(1)
      expect((await offlineVoices(page))[0]).toMatch(/^Offline/)
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/one-offline-voice-${use.viewport.width}-${colorScheme}.png` })

      serverDown = false
      const sampling = appPillWords(page, 3_000)
      await setOffline(context, false)
      const said = await sampling
      expect(said.filter((words) => words.includes("Can't reach the server")), said.join(" | ")).toEqual([])
      await expect(page.locator(APP_PILL)).toHaveCount(0, { timeout: 15_000 })
      if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/one-offline-voice-back-${use.viewport.width}-${colorScheme}.png` })
      await page.unrouteAll({ behavior: "ignoreErrors" })
      await context.close()
    })
  }
}
