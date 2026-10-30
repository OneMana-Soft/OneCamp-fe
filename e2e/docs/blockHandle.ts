import { expect, type Locator, type Page } from "@playwright/test"

// The block handle and its menu (B1), as a hand reaches them: shared by the
// doc specs that open a block's menu.

export const handle = (page: Page) => page.locator(".block-handle-floating")
export const grip = (page: Page) => page.getByRole("button", { name: "Drag to move or click for options" })
export const menu = (page: Page) => page.locator("[data-block-menu]")

/** The pointer over a block's first line, moving as a hand does. */
export async function hover(page: Page, block: Locator) {
  const box = (await block.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 2)
  await page.mouse.move(box.x + 40, box.y + 6, { steps: 3 })
  await expect(handle(page)).toHaveAttribute("data-visible", "true")
  await settled(page)
}

/** The handle has stopped gliding: its grip is where it was a moment ago. */
export async function settled(page: Page) {
  let last = ""
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await grip(page).boundingBox())
        const same = now === last
        last = now
        return same
      },
      { intervals: [60, 60, 120] },
    )
    .toBe(true)
}
