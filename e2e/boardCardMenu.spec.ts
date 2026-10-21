import { expect, test, type Page } from "@playwright/test"

import { openSideMenu } from "./menuReach"
import { openBoard } from "./projectBoard"

// The board card's menu on a laptop (1280 x 860), as the owner found it on 18
// Oct 2026: "the move to option in task card looks broken since nothing shows
// up when hovered". "Move to…" lit up and nothing opened beside it, by pointer
// or by keyboard, in every browser: its side menu was drawn inside the card's
// menu, which clipped it away (components/ui/dropdown-menu.tsx). Here the side
// menu opens both ways, each column in it can be seen and pressed, and
// choosing one moves the card.

/** The first To do card's menu, opened from its hover button. */
async function openCardMenu(page: Page) {
  const first = page.locator('[data-column="todo"] [data-task-id]').first()
  await first.hover()
  await first.getByRole("button", { name: "Card actions" }).click()
  const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Open" }) })
  await expect(menu).toBeVisible()
  return menu
}

const FIRST = "00000000-0000-4000-8000-100000000000"

test.describe("the board card's menu on a laptop", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  for (const theme of ["light", "dark"] as const) {
    test(`Move to… opens beside the menu under the pointer, and a column moves the card (${theme})`, async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const moves = await openBoard(page, testInfo, theme)
      const menu = await openCardMenu(page)
      const side = await openSideMenu(page, menu, "Move to…", "pointer")
      await expect(side.getByRole("menuitem")).toHaveText(["To do", "In progress", "Done"])
      // The column it is in carries the check (DESIGN-BUILD-2), and the others none.
      await expect(side.getByRole("menuitem", { name: "To do" })).toHaveAttribute("aria-current", "true")
      await expect(side.locator('[data-menu-check="on"]')).toHaveCount(1)
      await expect(side.getByRole("menuitem", { name: "To do" }).locator('[data-menu-check="on"]')).toBeVisible()
      for (const other of ["In progress", "Done"]) await expect(side.getByRole("menuitem", { name: other })).not.toHaveAttribute("aria-current", /.+/)
      // Beside the menu, not over it.
      const [m, s] = [(await menu.boundingBox())!, (await side.boundingBox())!]
      expect(s.x >= m.x + m.width - 8 || s.x + s.width <= m.x + 8, `side menu ${JSON.stringify(s)} beside ${JSON.stringify(m)}`).toBe(true)
      await side.getByRole("menuitem", { name: "Done" }).click()
      await expect.poll(() => moves.map((x) => x.task_status)).toEqual(["done"])
      expect(moves[0].task_uuid).toBe(FIRST)
      await expect(page.locator(`[data-column="done"] [data-task-id="${FIRST}"]`)).toBeVisible()
      await expect(page.getByRole("menu")).toHaveCount(0)
    })
  }

  test("the column the card is in moves nothing", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const moves = await openBoard(page, testInfo, "light")
    const side = await openSideMenu(page, await openCardMenu(page), "Move to…", "pointer")
    await side.getByRole("menuitem", { name: "To do" }).click()
    await expect(page.getByRole("menu")).toHaveCount(0)
    // A move would have been sent at once; give it the time one takes.
    await page.waitForTimeout(800)
    expect(moves).toEqual([])
    await expect(page.locator(`[data-column="todo"] [data-task-id="${FIRST}"]`)).toBeVisible()
  })

  test("Move to… opens from the keyboard, its first column focused, and Enter moves the card", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const moves = await openBoard(page, testInfo, "dark")
    // From the keyboard alone: the card's menu button takes focus (which
    // shows it, as a hover does) and Enter opens the menu on its first row.
    // The pointer stays still: one that moves tells Radix the keyboard is no
    // longer in use, and a side menu then opens with no row focused.
    const button = page.locator('[data-column="todo"] [data-task-id]').first().getByRole("button", { name: "Card actions" })
    await button.focus()
    await expect(button).toBeVisible()
    await page.keyboard.press("Enter")
    const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Open" }) })
    await expect(menu.getByRole("menuitem", { name: "Open" })).toBeFocused()
    const side = await openSideMenu(page, menu, "Move to…", "keyboard")
    await page.keyboard.press("ArrowDown")
    await expect(side.getByRole("menuitem", { name: "In progress" })).toBeFocused()
    // ArrowLeft goes back to the row, and the side menu closes.
    await page.keyboard.press("ArrowLeft")
    await expect(menu.getByRole("menuitem", { name: "Move to…" })).toBeFocused()
    await expect(side).toBeHidden()
    await page.keyboard.press("ArrowRight")
    await expect(side.getByRole("menuitem", { name: "To do" })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(side.getByRole("menuitem", { name: "In progress" })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect.poll(() => moves.map((x) => x.task_status)).toEqual(["inProgress"])
    await expect(page.locator(`[data-column="inProgress"] [data-task-id="${FIRST}"]`)).toBeVisible()
  })
})
