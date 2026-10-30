import { expect, test } from "@playwright/test"

import { holdChunk } from "./holdChunk"

// The signed-out pages' theme button loads its menu as a chunk of its own
// (components/themeProvider/themeMenu), so those pages don't carry the menu
// primitive. Its menu still opens by mouse and by keyboard, and a choice sets
// the theme, on a computer and on a phone.
for (const width of [1280, 390] as const) {
  test(`the theme button on a signed-out page, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    await page.goto("/reset-password")
    await expect(page.getByRole("heading", { name: /this link is missing or used/i })).toBeVisible()
    const button = page.getByRole("button", { name: "Toggle theme" })

    await button.click()
    await page.getByRole("menuitem", { name: "Dark" }).click()
    await expect(page.locator("html")).toHaveClass(/\bdark\b/)
    await expect(page.getByRole("menu")).toHaveCount(0)

    await button.focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem", { name: "Light" })).toBeVisible()
    await page.getByRole("menuitem", { name: "Light" }).click()
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/)
  })
}

// F6 (REGRESSION-HUNT, 26 Oct 2026): until its menu's chunk lands the button
// is a stand-in, and the menu draws its own in its place. A keyboard user on
// the stand-in was left on <body>, and Enter then opened nothing.
for (const width of [1280, 390] as const) {
  test(`the theme button keeps the keyboard's focus as its menu lands, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 })
    // The menu's chunk, marked by its System item.
    const chunk = await holdChunk(page, /children:\s*"System"/)
    await page.goto("/reset-password")
    const button = page.getByRole("button", { name: "Toggle theme" })
    await expect.poll(chunk.asked, { timeout: 30_000 }).toBe(true)
    await button.focus()
    chunk.release()
    // The menu's own button (Radix marks its state) is the one with the focus.
    await expect(button).toHaveAttribute("data-state", "closed")
    await expect(button).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem", { name: "Dark" })).toBeVisible()
    await chunk.done()
  })
}
