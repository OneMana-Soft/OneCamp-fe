import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { VIEWS, openChannel } from "./channelPage"
import { tabOnto } from "./focusRing"
import { stubBackend } from "./stubbedApp"

// TOOLTIPS ON DEMAND, in a production build (FLUIDITY H2, 5-6 Nov 2026). A closed tooltip draws its trigger alone,
// and Radix's side (components/ui/tooltipBridge) is a chunk of its own, fetched on idle or on a first mouse or Tab.
// What a person meets is what it was: 400 ms under a mouse (counted from the mouse, however late the code comes), at
// once within 300 ms of another, at once on a Tab (kept until the code lands), Escape hides it, a tap shows nothing
// and a long press does. The sidebar's section buttons (New project, New channel, New message) name themselves in a
// tooltip at 1280; the channel composer's Insert emoji ("Emoji") at 390.

const tip = (page: Page) => page.getByRole("tooltip")
/** A sidebar section's own plus (the sidebar's header has a New message of its own). */
const add = (page: Page, name: string) =>
  page.getByRole("complementary", { name: "Sidebar" }).getByRole("region").getByRole("button", { name, exact: true })

/** Holds every script that carries Radix's tooltip (its "tooltip.open" event) until `release()`. */
async function holdTooltipCode(page: Page) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const held: string[] = []
  await page.route(/\/_next\/static\/chunks\/[^?]+\.js(\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (body.includes('"tooltip.open"')) {
      held.push(route.request().url())
      await gate
    }
    await route.fulfill({ response, body })
  })
  return { release, held }
}

async function openHome(page: Page, testInfo: TestInfo) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {})
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(add(page, "New project")).toBeVisible({ timeout: 60_000 })
}

/** Ms from now until a tooltip saying `text` is on screen (polled each frame), or null after `ms`. */
async function msUntilShown(page: Page, text: string, ms = 10_000): Promise<number | null> {
  const from = Date.now()
  return page
    .waitForFunction((t) => [...document.querySelectorAll('[role="tooltip"]')].some((el) => el.textContent?.includes(t)), text, { polling: "raf", timeout: ms })
    .then(() => Date.now() - from)
    .catch(() => null)
}

/**
 * Puts the mouse on the middle of `name`'s button: in one move, or in `steps` as a hand does. From one open tooltip to
 * the next it takes steps: Radix keeps the open one while the mouse may be heading for it, and only a later move off
 * that path closes it and lets the next one open (its trigger ignores the mouse until then); one jump never sends one.
 */
async function pointAt(page: Page, name: string, steps = 1) {
  const box = await add(page, name).boundingBox()
  if (!box) throw new Error(`${name} has no box`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps })
}


test.describe("a tooltip at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })
  // A held chunk's fetch can still be in flight when a test ends.
  test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "ignoreErrors" }))

  test("under a mouse: 400 ms, at once within 300 ms of another, 400 ms again after, and Escape hides it", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openHome(page, testInfo)
    await pointAt(page, "New project")
    const first = await msUntilShown(page, "New project")
    expect(first, "New project's tooltip came").not.toBeNull()
    expect(first!).toBeGreaterThanOrEqual(390)
    // Within the skip window, the next one opens at once.
    await pointAt(page, "New channel", 8)
    const next = await msUntilShown(page, "New channel")
    expect(next, "New channel's tooltip came").not.toBeNull()
    expect(next!, "at once, not after another 400 ms").toBeLessThan(300)
    await expect(tip(page)).toHaveCount(1)
    await page.keyboard.press("Escape")
    await expect(tip(page)).toHaveCount(0)
    // Away for longer than the window: the full wait again.
    await page.mouse.move(700, 500)
    await page.waitForTimeout(700)
    await pointAt(page, "New message")
    const again = await msUntilShown(page, "New message")
    expect(again, "New message's tooltip came").not.toBeNull()
    expect(again!).toBeGreaterThanOrEqual(390)
  })

  test("on a Tab: at once, the focus stays, and Escape hides it", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openHome(page, testInfo)
    await tabOnto(page, add(page, "New project"))
    await expect(tip(page)).toHaveText("New project", { timeout: 10_000 })
    await expect(add(page, "New project")).toHaveAttribute("aria-describedby", (await tip(page).getAttribute("id"))!)
    await page.keyboard.press("Escape")
    await expect(tip(page)).toHaveCount(0)
    await expect(add(page, "New project")).toBeFocused()
  })

  test("before its code: a Tab keeps its tooltip till the code lands, and a mouse's 400 ms count from the mouse", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const code = await holdTooltipCode(page)
    await openHome(page, testInfo)
    await tabOnto(page, add(page, "New project"))
    await page.waitForTimeout(1000)
    await expect(tip(page)).toHaveCount(0)
    code.release()
    await expect(tip(page)).toHaveText("New project", { timeout: 10_000 })
    await expect(add(page, "New project")).toBeFocused()
    expect(code.held.length, "the tooltip's chunk was held").toBeGreaterThan(0)
  })

  test("before its code: a mouse that came 300 ms before it waits only what is left of 400 ms", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const code = await holdTooltipCode(page)
    await openHome(page, testInfo)
    const came = Date.now()
    await pointAt(page, "New project")
    await page.waitForTimeout(300)
    await expect(tip(page)).toHaveCount(0)
    const landed = Date.now()
    code.release()
    const after = await msUntilShown(page, "New project")
    expect(after, "the tooltip came").not.toBeNull()
    expect(landed - came + after!, "not before the 400 ms").toBeGreaterThanOrEqual(390)
    // Counted from the code's landing, it would be another 400 ms: here it is the code's own time only.
    expect(after!, "no second 400 ms after the code").toBeLessThan(350)
    expect(code.held.length, "the tooltip's chunk was held").toBeGreaterThan(0)
  })
})

test.describe("a tooltip at 390 with touch", () => {
  const phone = VIEWS.find((v) => v.phone)!

  test("a tap shows no tooltip", async ({ browser }, testInfo) => {
    test.setTimeout(200_000)
    const tab = await openChannel(browser, testInfo, phone, "light")
    const emoji = tab.getByRole("button", { name: "Insert emoji" })
    await expect(emoji).toBeVisible({ timeout: 60_000 })
    await tab.evaluate(() => {
      const w = window as unknown as { __tipSeen: boolean }
      w.__tipSeen = false
      const look = () => {
        if (document.querySelector('[role="tooltip"]')) w.__tipSeen = true
        requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    await emoji.tap()
    await tab.waitForTimeout(1500)
    expect(await tab.evaluate(() => (window as unknown as { __tipSeen: boolean }).__tipSeen), "a tooltip showed on a tap").toBe(false)
    await tab.context().close()
  })

  test("a long press shows it", async ({ browser }, testInfo) => {
    test.setTimeout(200_000)
    const tab = await openChannel(browser, testInfo, phone, "light")
    const emoji = tab.getByRole("button", { name: "Insert emoji" })
    await expect(emoji).toBeVisible({ timeout: 60_000 })
    const box = (await emoji.boundingBox())!
    const cdp = await tab.context().newCDPSession(tab)
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] })
    await expect(tip(tab)).toHaveText("Emoji", { timeout: 10_000 })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await tab.context().close()
  })
})
