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

    // A browser keeps a snapped strip on the tab it rested on when the row's
    // layout changes, so a tab drawn ahead of that one after the first paint
    // scrolled the strip by the new tab's width and cut it (DESIGN-BUILD-87,
    // 2 Nov: New task's Type chip, drawn once the project is known, showed
    // its last letters at a phone's edge). Every strip, every width.
    test("stays at its start when a tab arrives ahead, and keeps a tab the person scrolled to", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openLater(page, testInfo)
      const strip = page.getByRole("tablist", { name: "Later" })
      await expect(strip).toBeVisible({ timeout: 60_000 })
      // Long and narrow enough to scroll whatever its tabs are called (three
      // more copies of its first tab at its end), its own snap kept.
      await strip.evaluate((el) => {
        const first = el.querySelector(':scope > :not([aria-hidden="true"])')!
        for (let i = 0; i < 3; i++) el.append(Object.assign(first.cloneNode(true) as HTMLElement, { id: "" }))
        el.style.maxWidth = "120px"
      })
      await expect.poll(() => strip.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(48)
      /** Draws a copy of the first tab ahead of the others, as a late tab arrives, and reads the strip once it has laid out. */
      const arrive = () => strip.evaluate(async (el) => {
        const first = el.querySelector(':scope > :not([aria-hidden="true"])')!
        el.prepend(Object.assign(first.cloneNode(true) as HTMLElement, { id: "" }))
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        return el.scrollLeft
      })
      expect(await strip.evaluate((el) => el.scrollLeft)).toBe(0)
      expect(await arrive()).toBe(0)

      // Scrolled by the person to a later tab, the strip keeps that tab where it was.
      const at = () => strip.evaluate((el) => {
        const tabs = [...el.querySelectorAll(':scope > :not([aria-hidden="true"])')]
        const seen = tabs.find((t) => t.getBoundingClientRect().left >= el.getBoundingClientRect().left + 8)!
        return [seen.textContent, Math.round(seen.getBoundingClientRect().left - el.getBoundingClientRect().left)] as const
      })
      // To its third tab, resting clear of the fade (not to its end, where the
      // last tabs can't come to rest and a longer row lets them).
      await strip.evaluate(async (el) => {
        const third = el.querySelectorAll(':scope > :not([aria-hidden="true"])')[2]
        el.scrollTo({ left: el.scrollLeft + third.getBoundingClientRect().left - el.getBoundingClientRect().left - 24 })
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      })
      const before = await at()
      await arrive()
      expect(await at()).toEqual(before)
    })
  })
}
