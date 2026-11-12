import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp, setOffline } from "../scripts/fluidity/fakeApp.mjs"
import { docFromBlocks, launchPlanBlocks } from "../scripts/fluidity/fakeCollab.mjs"

// The doc's connection pill is a chunk of its own, fetched once the page is
// idle (LazyConnectionPill). A person who loses the network before it is in
// still hears that the doc is offline (V-667): a stand-in says it in the
// pill's words, after the pill's wait, and the pill takes over once the
// network is back and its code comes. Here the pill's chunk is held until
// then, so the network goes before it is in, every time. With SHOTS_DIR set,
// saved for review at 1280 and 390.

const PLAN = "d0c00000-0000-4000-8000-000000000001"
const EDITABLE = '.doc-editor .ProseMirror[contenteditable="true"]'

const DEVICES = {
  computer: { use: { viewport: { width: 1280, height: 860 } }, words: "Offline. Changes are kept and will sync" },
  // A phone's pill names only the connection: the save notice beside it says what becomes of the work (V-21).
  phone: { use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, words: "Offline" },
} satisfies Record<string, { use: BrowserContextOptions; words: string }>

/** The pill's chunk: the one script that says "Still connecting…" (the splash says "Still connecting to …"). */
const PILL_CODE = /Still connecting(…|\\u2026)/

async function typeAtEnd(page: Page, words: string) {
  await page.locator(`${EDITABLE} > p`).last().click()
  await page.keyboard.press("End")
  await page.keyboard.type(words, { delay: 15 })
}

for (const [device, { use, words }] of Object.entries(DEVICES)) {
  test(`on a ${device}, offline before the connection pill's code is in, the doc still says offline, and the pill takes over once back`, async ({ browser }) => {
    test.setTimeout(120_000)
    const plan = docFromBlocks(launchPlanBlocks(), { epoch: "E1" })
    const doc = { id: PLAN, title: "Q4 launch plan", html: plan.html, update: plan.update, levels: { sam: "full" } }
    const collab = collabFor([doc])
    // No service worker: page.route sees every chunk, as on a first visit, which the worker's cache can't cover.
    const context = await browser.newContext({ ...use, serviceWorkers: "block" })
    await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [doc], collab })
    const page = await context.newPage()

    // The pill's chunk is asked for (on idle, or at the problem) but comes only once the network is back.
    let offline = false
    let pillCodeIn = false
    let back = () => {}
    const networkBack = new Promise<void>((resolve) => (back = resolve))
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, async (route) => {
      if (offline) return route.fallback()
      const response = await route.fetch()
      if (PILL_CODE.test(await response.text())) {
        await networkBack
        pillCodeIn = true
      }
      await route.fulfill({ response })
    })

    await page.goto(`/app/doc/${PLAN}`)
    await expect(page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
    const gotIt = page.getByRole("button", { name: "Got it" })
    await gotIt.waitFor({ timeout: 5_000 }).then(() => gotIt.click(), () => undefined)

    offline = true
    await setOffline(context, true)
    await typeAtEnd(page, " Typed offline.")
    const pill = page.locator('[data-doc-view] [role="status"][data-connection-pill="offline"]')
    await expect(pill).toBeVisible({ timeout: 15_000 })
    await expect(pill).toHaveText(words)
    expect(pillCodeIn).toBe(false)
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/doc-pill-offline-before-code-${use.viewport.width}.png` })

    offline = false
    back()
    await setOffline(context, false)
    await expect.poll(() => pillCodeIn, { timeout: 15_000 }).toBe(true)
    await expect(page.locator('[data-connection-pill="offline"]')).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => collab.doc(PLAN).getXmlFragment("default").toString(), { timeout: 30_000 }).toContain("Typed offline.")
    // A chunk still being fetched by the route when the context closes is no failure of the page's.
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await context.close()
  })
}
