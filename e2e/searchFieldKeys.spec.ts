import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { holdChunk } from "./holdChunk"
import { stubBackend } from "./stubbedApp"

// Typing into the search field on a cold load. The field drawn first is a
// stand-in: SearchInput is a chunk of its own (components/ui/lazy-search-input),
// fetched when the page is idle or the field is focused. It swapped in under
// the typing, the focus fell to the page, and the keys after it went with it:
// "abcdef" left "a" in the box (26 Oct 2026, on the demo, at 1280 by mouse and
// at 390 by touch). Here SearchInput's chunk is held until the field is
// focused, then lets go at once, or slowly as on a poor connection.

async function open(page: Page, testInfo: TestInfo) {
  // SearchInput's chunk, marked by its displayName.
  const chunk = await holdChunk(page, /displayName\s*=\s*["']SearchInput["']/)
  await stubBackend(page, testInfo, { "/query/search": { data: { page: [], totals: {}, total: 0, has_more: false, notes: [], query: { runs: true, issues: [], text: "" } } } })
  await page.goto("/app/search", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const box = page.getByRole("searchbox", { name: "Search" })
  await expect(box).toBeVisible({ timeout: 60_000 })
  // The page asks for the chunk once it has drawn and gone idle: it's live, and the field is still the stand-in.
  await expect.poll(chunk.asked, { timeout: 30_000 }).toBe(true)
  await box.evaluate((el) => void ((el as HTMLInputElement & { standIn?: true }).standIn = true))
  return { box, chunk }
}

/** Until SearchInput's field has taken the stand-in's place. */
const swapped = (box: Locator) => expect.poll(() => box.evaluate((el) => !(el as HTMLInputElement & { standIn?: true }).standIn), { timeout: 30_000 }).toBe(true)

for (const s of [
  { name: "a computer, by mouse", viewport: { width: 1280, height: 860 }, touch: false },
  { name: "a phone, by touch", viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`the search field typed in on a cold load, on ${s.name}`, () => {
    test.use({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, contextOptions: { reducedMotion: "reduce" } })

    for (const c of [
      { name: "its chunk lands as typing starts", ms: 0, delay: 40 },
      { name: "its chunk comes slowly, landing mid-word", ms: 250, delay: 90 },
    ]) {
      test(`keeps every key and the focus: ${c.name}`, async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { box, chunk } = await open(page, testInfo)
        if (s.touch) await box.tap()
        else await box.click()
        chunk.release(c.ms)
        await page.keyboard.type("abcdef", { delay: c.delay })
        await swapped(box)
        await expect(box).toHaveValue("abcdef")
        await expect(box).toBeFocused()
        // And the keys after it land too: the shared field has the caret at the end.
        await page.keyboard.type("g")
        await expect(box).toHaveValue("abcdefg")
        await chunk.done()
      })
    }
  })
}
