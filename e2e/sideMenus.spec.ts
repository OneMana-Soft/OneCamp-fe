import { expect, test, type Page } from "@playwright/test"

import { openSideMenu } from "./menuReach"
import { openBoard } from "./projectBoard"

// The side menus a project page shows on a laptop, each opened by pointer and
// by keyboard, every row in view and under the pointer, and a choice that
// does its thing (18 Oct 2026; the board card's "Move to…" is
// boardCardMenu.spec.ts). The Filter facets come from the primitive
// (components/ui/dropdown-menu.tsx), and so do the shell's menus: both are
// portalled, which menuPortalGuard.test.ts keeps.

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

// The shell menus draw components/ui/dropdown-menu rows, so a side menu opened by keyboard stays open under a
// resting mouse as every other menu's does (lib/ui/stillPointer; app/menuRowsGuard.test.ts).
for (const theme of ["light", "dark"] as const) {
  test(`the profile menu's Pause notifications opened by keyboard stays open under a resting mouse, ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo, theme)
    await page.getByRole("button", { name: "Profile and settings" }).click()
    const menu = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "Your profile" }) })
    const profile = menu.getByRole("menuitem", { name: "Your profile" })
    await profile.hover()
    await expect(profile).toBeFocused()
    const box = (await profile.boundingBox())!
    const rest = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
    await page.mouse.move(rest.x, rest.y)
    const pauseRow = menu.getByRole("menuitem", { name: /Pause notifications|Notifications paused/ })
    await expect(async () => {
      await page.keyboard.press("ArrowUp")
      await expect(pauseRow).toBeFocused({ timeout: 200 })
    }).toPass({ timeout: 10_000 })
    await page.keyboard.press("ArrowRight")
    await expect(pauseRow).toHaveAttribute("aria-expanded", "true")
    const rows = page.locator(`[id="${await pauseRow.getAttribute("aria-controls")}"]`).getByRole("menuitem")
    await expect(rows.first()).toBeFocused()
    // The page shifting under the resting mouse sends its row an unmoved pointer event: sent here at the same place.
    await page.mouse.move(rest.x, rest.y)
    await page.keyboard.press("ArrowDown")
    await expect(rows.nth(1)).toBeFocused()
    await expect(pauseRow).toHaveAttribute("aria-expanded", "true")
    await expect(page.locator("[data-sub-step-head]"), "beside its row, a side menu has no step head").toHaveCount(0)
  })
}

// On a phone on its side the shell's menus are the primitive's sheets, and a
// side menu is one too: as wide as the sheet it came from. A width the shell
// forced on its desktop menus (264px, 224px) made Pause a strip down the middle.
test.describe("a phone on its side, by touch", () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })
  // The laid-out width: a sheet's box is scaled while it rises, so its rect is a frame of the entrance.
  const width = (page: Page) => page.locator('[role="menu"][data-state="open"]').last().evaluate((el) => (el as HTMLElement).offsetWidth)

  test("the profile sheet's Pause notifications and More places are sheets as wide as any", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo, "light")
    await page.getByRole("button", { name: "Profile and settings" }).tap()
    await expect(page.getByRole("menuitem", { name: "Your profile" })).toBeVisible()
    const sheet = await width(page)
    expect(sheet, "the profile menu is a sheet, not a 264px menu").toBeGreaterThan(300)
    await page.getByRole("menuitem", { name: /Pause notifications/ }).tap()
    await expect(page.getByRole("menuitem", { name: /Custom…/ })).toBeVisible()
    await expect.poll(() => width(page), { message: "Pause: as wide as the profile sheet" }).toBe(sheet)
    // A step further in: it says where it is, and Back returns to the profile sheet.
    const step = page.locator('[role="menu"][data-state="open"]').last()
    await expect(step.locator("[data-sub-step-head]"), "Pause's step names itself").toHaveText("Pause notifications")
    await step.getByRole("menuitem", { name: "Back" }).tap()
    await expect(page.getByRole("menuitem", { name: /Custom…/ })).toHaveCount(0)
    await expect(page.getByRole("menuitem", { name: "Your profile" }), "Back leaves the profile sheet up").toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    await page.getByRole("button", { name: /^More(, on .+)?$/ }).first().tap()
    await expect(page.getByRole("menu")).toHaveCount(1)
    await expect.poll(() => width(page), { message: "More places: as wide as the profile sheet" }).toBe(sheet)
    await expect(page.getByRole("menu").getByText("More places", { exact: true }), "the More places sheet names itself").toBeVisible()
  })
})
