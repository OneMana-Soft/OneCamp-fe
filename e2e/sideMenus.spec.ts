import { expect, test } from "@playwright/test"

import { openSideMenu } from "./menuReach"
import { openBoard } from "./projectBoard"

// The side menus a project page shows on a laptop, each opened by pointer and
// by keyboard, every row in view and under the pointer, and a choice that
// does its thing (18 Oct 2026; the board card's "Move to…" is
// boardCardMenu.spec.ts). The Filter facets come from the primitive
// (components/ui/dropdown-menu.tsx), the pause menu from the sidebar's own
// Radix menu: both are portalled, which menuPortalGuard.test.ts keeps.

test.use({ viewport: { width: 1280, height: 860 } })

for (const facet of ["Status", "Priority", "Assignee"]) {
  test(`the Filter menu's ${facet} side menu opens by pointer and by keyboard`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo, "light")
    await page.getByRole("button", { name: "Filter" }).click()
    const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Status" }) })
    await openSideMenu(page, menu, facet, "pointer")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await page.getByRole("button", { name: "Filter" }).focus()
    await page.keyboard.press("Enter")
    await openSideMenu(page, menu, facet, "keyboard")
  })
}

test("choosing High in the Filter's Priority side menu filters the board", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await openBoard(page, testInfo, "light")
  const asked: string[] = []
  page.on("request", (r) => {
    if (r.url().includes("/project/taskListForKanban/")) asked.push(decodeURIComponent(new URL(r.url()).search))
  })
  await page.getByRole("button", { name: "Filter" }).click()
  const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Status" }) })
  const side = await openSideMenu(page, menu, "Priority", "pointer")
  await side.getByRole("menuitemcheckbox", { name: /high/i }).or(side.getByRole("menuitem", { name: /high/i })).first().click()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  // The board asks again for High alone.
  await expect.poll(() => asked.some((q) => /priority/i.test(q) && /high/i.test(q)), { message: `asked: ${asked.join(" ; ")}` }).toBe(true)
})

test("the profile menu's Pause notifications opens beside it, and a choice pauses them", async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await openBoard(page, testInfo, "dark")
  const posts: string[] = []
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(new URL(r.url()).pathname)
  })
  await page.getByRole("button", { name: "Profile and settings" }).click()
  const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Your profile" }) })
  const side = await openSideMenu(page, menu, /Pause notifications/, "pointer")
  await side.getByRole("menuitem").first().click()
  await expect.poll(() => posts.some((p) => /pause|notification|dnd|snooze/i.test(p)), { message: `writes: ${posts.join(", ")}` }).toBe(true)
})
