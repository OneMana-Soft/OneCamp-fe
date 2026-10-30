import { expect, test, type Locator, type Page } from "@playwright/test"

import { trapsAtRest } from "./menuReach"
import { openBoard } from "./projectBoard"

// Every kind of overlay, once open and settled, holds nothing that makes it
// the containing block of a fixed box inside it (18 Oct 2026). The menus'
// entrance filled forwards and kept an identity transform, which is how the
// board card's side menu was clipped away whole; a popover, a sheet or a
// dialog holding one confines whatever unportalled picker it carries.
// Entrances now fill backwards (app/globals.css --animate-in, .shell-pop,
// content-float, v3-dialog and v3-sheet).

test.use({ viewport: { width: 1280, height: 860 } })

/** The overlay open last, pinned by its id (a side menu opening later is "last" too). */
async function open(page: Page): Promise<Locator> {
  const last = page.locator('[role="menu"][data-state="open"], [role="dialog"][data-state="open"]').last()
  await expect(last).toBeVisible()
  return page.locator(`[id="${await last.getAttribute("id")}"]`)
}

async function expectAtRest(root: Locator, what: string, allow: RegExp | null = null) {
  await expect(root).toBeVisible()
  const traps = (await trapsAtRest(root)).filter((t) => !allow?.test(t))
  expect(traps, `${what} at rest`).toEqual([])
}

test("menus, side menus, popovers and dialogs hold no transform at rest", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await openBoard(page, testInfo, "light")

  // A menu (the primitive) and its side menu.
  await page.getByRole("button", { name: "Filter" }).click()
  const filter = await open(page)
  await expectAtRest(filter, "the Filter menu")
  const facet = filter.locator('[role="menuitem"][aria-haspopup="menu"]').first()
  await facet.hover()
  await expect(facet).toHaveAttribute("aria-expanded", "true")
  await expectAtRest(page.locator(`[id="${await facet.getAttribute("aria-controls")}"]`), "a Filter side menu")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)

  // A popover.
  await page.getByRole("button", { name: "Cycles" }).click()
  await expectAtRest(page.locator('[data-radix-popper-content-wrapper] > [role="dialog"]'), "the Cycles popover")
  await page.keyboard.press("Escape")

  // The sidebar's menu (.shell-pop) and its side menu.
  await page.getByRole("button", { name: "Profile and settings" }).click()
  const profile = await open(page)
  await expectAtRest(profile, "the profile menu")
  const pause = profile.getByRole("menuitem", { name: /notifications/i }).first()
  await pause.hover()
  await expect(pause).toHaveAttribute("aria-expanded", "true")
  await expectAtRest(page.locator(`[id="${await pause.getAttribute("aria-controls")}"]`), "the pause side menu")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")

  // A dialog: centred with inset 0 and margin auto, no transform (components/ui/dialog).
  await page.getByLabel("New task", { exact: true }).click()
  await expectAtRest(page.locator('[role="dialog"][data-state="open"]').last(), "the new-task dialog")
})
