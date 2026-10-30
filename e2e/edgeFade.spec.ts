import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// A tab or chip strip that scrolls sideways fades the edge with more past it
// (app/interaction.css, data-edge-fade), and its own scroll drives the fades:
// at the start only the far end fades, at the end only the start does. The
// production build made the fades last 0s, so a strip at rest faded its first
// tab and never its far end. Later's tabs stand for every strip: they draw
// whatever the list holds (My tasks draws no tabs while it's empty).

async function openLater(page: Page, testInfo: TestInfo) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {})
  await page.goto("/app/later", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/** The strip's two fades, as its mask reads them, after the scroll has drawn. */
const fades = (strip: Locator) => strip.evaluate(async (el) => {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  const s = getComputedStyle(el)
  return [s.getPropertyValue("--ix-fade-s").trim(), s.getPropertyValue("--ix-fade-e").trim()]
})

for (const [label, use] of [
  ["at 1280", { viewport: { width: 1280, height: 860 } }],
  ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  // globals.css shortens every animation to 0.01ms under reduced motion; a scroll-driven one must still span the scroll.
  ["at 1280 with reduced motion", { viewport: { width: 1280, height: 860 }, contextOptions: { reducedMotion: "reduce" } }],
] as const) {
  test.describe(`a strip that scrolls sideways, ${label}`, () => {
    test.use(use)

    test("fades only the edge with more past it, at rest and at its end", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openLater(page, testInfo)
      const strip = page.getByRole("tablist", { name: "Later" })
      await expect(strip).toBeVisible({ timeout: 60_000 })
      // Narrow enough to scroll whatever its tabs are called, with no snap
      // point short of either end.
      await strip.evaluate((el) => {
        el.style.maxWidth = "40px"
        el.style.scrollSnapType = "none"
      })
      await expect.poll(() => strip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(48)

      await expect.poll(() => fades(strip)).toEqual(["0px", "24px"])
      await strip.evaluate((el) => void (el.scrollLeft = el.scrollWidth))
      await expect.poll(() => fades(strip)).toEqual(["24px", "0px"])
    })
  })
}
