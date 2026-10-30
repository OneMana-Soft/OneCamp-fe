import { expect, test, type Locator, type Page } from "@playwright/test"

import { openBoard } from "./projectBoard"

// On a phone every floating overlay is a bottom sheet (components/ui/overlayMode,
// app/overlay.css; the owner, 18 Oct: "in case of mobile can we make all
// popover/dialog a drawer"): a menu, a popover and a dialog, in portrait and in
// landscape, stand at the screen's foot across its width (640px at most in
// landscape), dim the page, and leave nothing they hold out of reach.

const PHONES = [
  { name: "portrait", viewport: { width: 390, height: 844 } },
  { name: "landscape", viewport: { width: 844, height: 390 } },
]

/** Where a sheet stands: its foot at the screen's, its sides, and whether it is pinned there. */
async function asSheet(root: Locator) {
  // Measured once it has risen: its entrance and any transition settled.
  await root.evaluate((el) => Promise.all(el.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))))
  await root.page().waitForTimeout(150)
  return root.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { pinned: getComputedStyle(el).position === "fixed" || (!!el.parentElement?.hasAttribute("data-radix-popper-content-wrapper") && getComputedStyle(el.parentElement).position === "fixed"), bottom: Math.round(innerHeight - r.bottom), width: Math.round(r.width), left: Math.round(r.left), top: Math.round(r.top), screen: innerWidth, css: `${getComputedStyle(el).bottom} ${getComputedStyle(el).transform} kb=${document.documentElement.dataset.keyboard}` }
  })
}

function standsAsSheet(s: Awaited<ReturnType<typeof asSheet>>, what: string) {
  expect(s.pinned, `${what}: pinned to the screen, not to its trigger`).toBe(true)
  expect(Math.abs(s.bottom), `${what}: at the screen's foot, not past it (${s.css})`).toBeLessThanOrEqual(1)
  expect(s.top, `${what}: on the screen`).toBeGreaterThanOrEqual(0)
  expect(s.width, `${what}: the screen's width, or 640 in landscape`).toBe(Math.min(s.screen, 640))
}

async function dimmed(page: Page) {
  // The dialog's or drawer's own dim, or the page's (body::after, app/overlay.css).
  const dim = await page.evaluate(() => !!document.querySelector(".v3-overlay[data-state=open], [data-vaul-overlay][data-state=open]") || getComputedStyle(document.body, "::after").content !== "none")
  expect(dim, "the page dims under the sheet").toBe(true)
}

for (const phone of PHONES) {
  test.describe(`a phone in ${phone.name}`, () => {
    test.use({ viewport: phone.viewport, isMobile: true, hasTouch: true })

    test("a menu, a popover and a dialog open as bottom sheets", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBoard(page, testInfo, "light")

      const filter = page.getByRole("button", { name: "Filter" })
      if (await filter.count()) {
        await filter.first().click()
        // Where the board has room for its own drawer (portrait), Filter opens that; else its menu.
        const menu = page.locator('[role="menu"][data-state="open"], [data-vaul-drawer][data-state="open"]').last()
        await expect(menu).toBeVisible()
        standsAsSheet(await asSheet(menu), "the Filter menu")
        await dimmed(page)
        for (const row of await menu.getByRole("menuitem").all()) expect((await row.boundingBox())!.height, "a menu row under a finger").toBeGreaterThanOrEqual(44)
        await page.keyboard.press("Escape")
        await expect(menu).toBeHidden()
      }

      const cycles = page.getByRole("button", { name: "Cycles" })
      if (await cycles.count()) {
        await cycles.first().click()
        const pop = page.locator('[data-radix-popper-content-wrapper] > [data-overlay]').last()
        await expect(pop).toBeVisible()
        standsAsSheet(await asSheet(pop), "the Cycles popover")
        await dimmed(page)
        await page.keyboard.press("Escape")
        await expect(pop).toBeHidden()
      }

      await page.getByLabel("New task", { exact: true }).first().click()
      const dialog = page.locator('[role="dialog"][data-state="open"]').last()
      await expect(dialog).toBeVisible()
      standsAsSheet(await asSheet(dialog), "the new-task dialog")
      await dimmed(page)
    })
  })
}
