import { expect, test } from "@playwright/test"

import { DOC, inboxWithANotice } from "./inboxNotice"

// Interaction audit SH-31, SH-32 (15 Oct 2026): app/hub.css hid a row's
// toolbar wherever nothing can hover, so on a phone the inbox, Later and
// search rows' tools (mark read, save, remind, remove) were out of reach. A
// row with tools shows an Actions button there, which shows them; keyboard
// focus in the row shows them too. Every hub list draws its rows with HubRow,
// so the inbox stands for them all.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test("a tap on a row's Actions shows its tools, each a finger wide, and a tool works", async ({ page }, testInfo) => {
  const row = await inboxWithANotice(page, testInfo)
  const tools = row.locator(".hub-row-tools")
  await expect(tools).toBeHidden()
  await row.getByRole("button", { name: "Actions" }).tap()
  await expect(tools).toBeVisible()
  const open = tools.getByRole("link", { name: "Open" })
  await expect(open).toBeVisible()
  const box = (await open.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  await open.tap()
  await expect(page).toHaveURL(new RegExp(`/app/doc/${DOC}`), { timeout: 30_000 })
})

test("keyboard focus in a row shows its tools on a touch screen too", async ({ page }, testInfo) => {
  const row = await inboxWithANotice(page, testInfo)
  const tools = row.locator(".hub-row-tools")
  await expect(tools).toBeHidden()
  for (let i = 0; i < 80 && !(await row.evaluate((r) => r.contains(document.activeElement))); i++) await page.keyboard.press("Tab")
  await expect(tools).toBeVisible()
  // Tab walks into the tools, and they stay while it does.
  for (let i = 0; i < 4 && !(await tools.evaluate((t) => t.contains(document.activeElement))); i++) await page.keyboard.press("Tab")
  expect(await tools.evaluate((t) => t.contains(document.activeElement))).toBe(true)
  await expect(tools).toBeVisible()
})
