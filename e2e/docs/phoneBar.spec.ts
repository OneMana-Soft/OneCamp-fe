import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { openKeyboard } from "../keyboard"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// The phone's Formatting bar (components/docEditor/DocAccessoryBar), whose
// code only a phone fetches (docInput's lazyPart, 24 Oct 2026): on a phone it
// docks above the keyboard once a finger is in the text, and its buttons
// work; a computer never draws it, and formats from the selection bar.

const DOC = "5e1d2c3b-4a59-4687-9a0b-1c2d3e4f5a6b"
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true }
// A doc's first load on a production build takes most of the default 30 s under a loaded gate, as the other doc specs allow for.
test.describe.configure({ timeout: 120_000 })

// V-72: with the keyboard up the app's frame is fitted to what is left of the
// screen (app/globals.css, THE ON-SCREEN KEYBOARD), and that frame, being
// transformed, is the box the bar is placed in. The bar's bottom counted the
// keyboard a second time, so it floated 336 px up, under the demo notice and
// over its Got it, while "at or above the keyboard" still held. It sits ON the
// keyboard, and what it publishes keeps in step: the foot that whatever floats
// over the whole screen clears (--mobile-drawer-h, the toasts' floor), and
// the caret's room above it.
for (const theme of ["light", "dark"] as const) {
  test(`on a phone (${theme}), the Formatting bar sits on the keyboard once a finger is in the text, the caret stays just above it, and its Bold works`, async ({ browser }, testInfo) => {
    const relay = new CollabRelay()
    const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, {}, PHONE)
    await tab.page.emulateMedia({ colorScheme: theme })
    // On the first line, where a person taps: an empty doc's "Start with" list lies over the middle of the text.
    await tab.body.tap({ position: { x: 24, y: 12 } })
    const bar = tab.page.getByRole("toolbar", { name: "Formatting" })
    await expect(bar).toBeVisible({ timeout: 15_000 })

    const close = await openKeyboard(tab.page, "visual")
    const keyboardTop = await tab.page.evaluate(() => Math.round((window.visualViewport?.height ?? window.innerHeight) + (window.visualViewport?.offsetTop ?? 0)))
    const barBox = async () => (await bar.boundingBox()) ?? { x: 0, y: Infinity, width: 0, height: 0 }
    // Its bottom is the keyboard's top, to the pixel: not merely somewhere above it.
    await expect.poll(async () => Math.abs(Math.round((await barBox()).y + (await barBox()).height) - keyboardTop)).toBeLessThanOrEqual(1)
    const barTop = Math.round((await barBox()).y)
    // The foot it publishes is the keyboard and the bar, from the screen's bottom, so a toast clears it.
    const foot = await tab.page.evaluate(() => ({
      published: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h"))),
      screen: window.innerHeight,
    }))
    expect(Math.abs(foot.published - (foot.screen - barTop))).toBeLessThanOrEqual(1)

    // Typed down to the foot of the text, the caret keeps just above the bar: never under it, and the
    // text doesn't scroll it far up either (its room is the bar's, in the fitted frame).
    for (let line = 1; line <= 16; line++) {
      await tab.page.keyboard.type(`Line ${line}`)
      await tab.page.keyboard.press("Enter")
    }
    await tab.page.keyboard.type("Ship it")
    const caretBottom = () =>
      tab.page.evaluate(() => {
        const sel = window.getSelection()
        return sel && sel.rangeCount > 0 ? Math.round(sel.getRangeAt(0).getBoundingClientRect().bottom) : -1
      })
    await expect.poll(caretBottom).toBeLessThanOrEqual(barTop)
    expect(await caretBottom()).toBeGreaterThan(barTop - 80)
    await tab.page.screenshot({ path: testInfo.outputPath(`390-doc-bar-keyboard-${theme}.png`) })

    await tab.page.keyboard.press("Shift+Home")
    await bar.getByRole("button", { name: "Bold" }).tap()
    await expect(tab.body.locator("strong")).toHaveText("Ship it")
    await close()
    await tab.close()
  })
}

test("a computer never draws the phone's Formatting bar, and formats from the selection bar", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC })
  // The keys tip comes 6 s in, and takes the focus from the doc (c51fe-5, c51-iter8): this browser has had it.
  await tab.page.context().addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await tab.page.reload({ waitUntil: "domcontentloaded" })
  await expect(tab.body).toBeVisible({ timeout: 60_000 })
  await tab.body.click()
  await tab.page.keyboard.type("Ship it")
  await tab.page.keyboard.press("Shift+Home")
  const selectionBar = tab.page.locator("[data-doc-selection-bar]")
  await expect(selectionBar).toBeVisible({ timeout: 15_000 })
  await selectionBar.getByRole("button", { name: "Bold" }).click()
  await expect(tab.body.locator("strong")).toHaveText("Ship it")
  await expect(tab.page.locator("[data-doc-accessory-bar]")).toHaveCount(0)
  await tab.close()
})
