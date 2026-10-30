import { expect, test, type Locator, type Page } from "@playwright/test"

import { holdChunk } from "../holdChunk"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables package 1, V1 (migration 512): a table's views were the four layout
// tabs alone, so nobody could keep a way of seeing a table, share it, or
// protect it. A saved view keeps a layout, its rules and how it draws; it is
// shared with everyone or the reader's own, and a manager may lock a shared
// one. Anyone may save their changes as a view of their own.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "due", name: "Due", type: "date" },
]
const EVERYTHING = "5a7e0000-0000-4000-8000-0000000000aa"
const PIPELINE = "5a7e0000-0000-4000-8000-0000000000bb"

function deals() {
  const server = new TableServer(fields, [{ item: "Booth", stage: "To do", due: "2026-11-02" }, { item: "Banner", stage: "Done" }])
  server.savedViews = [{ id: EVERYTHING, table_id: server.id, name: "Everything", type: "grid", config: "{}", position: 0 }]
  return server
}

const viewWrites = (server: TableServer) => server.writes.filter((w) => w.kind === "view").map((w) => w.body)

for (const device of [
  { name: "at 1280, by mouse", options: {}, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())
  const tab = (page: Page, name: string) => page.getByRole("group", { name: "View", exact: true }).getByRole("button", { name, exact: true })
  // A change's Save, Save as mine and Reset: buttons after the layout tabs on a computer, the views sheet's first
  // rows on a phone, which this opens. Each is found in what it gives, by `role`.
  const role = device.touch ? ("menuitem" as const) : ("button" as const)
  const changeActions = async (page: Page): Promise<Page | Locator> => {
    if (!device.touch) return page
    await press(page.getByRole("button", { name: /^View: .+, changed$/ }))
    return page.getByRole("menu")
  }

  test(`${device.name}, a member saves their changes to a shared view as their own, listed under Only me, and its link opens it`, async ({ browser }, testInfo) => {
    const server = deals()
    server.canManage = false
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    await expect(page.getByRole("button", { name: "View: Everything", exact: true })).toBeVisible({ timeout: 30_000 })

    await press(tab(page, "Board"))
    await expect(page.getByRole("button", { name: "View: Everything, changed", exact: true })).toBeVisible()
    // The shared view isn't theirs to change: only their own copy is offered.
    const actions = await changeActions(page)
    await expect(actions.getByRole(role, { name: "Save as mine", exact: true })).toBeVisible()
    await expect(actions.getByRole(role, { name: "Save", exact: true })).toHaveCount(0)
    await press(actions.getByRole(role, { name: "Save as mine", exact: true }))
    const naming = page.getByRole("dialog", { name: "Save as my view" })
    await expect(naming.getByRole("textbox", { name: "Name" })).toHaveValue("Everything (mine)")
    await expect(naming.getByText("Who sees it")).toHaveCount(0)
    await press(naming.getByRole("button", { name: "Save", exact: true }))

    await expect.poll(() => server.savedViews.length, { timeout: 15_000 }).toBe(2)
    const mine = server.savedViews[1]
    expect(mine).toMatchObject({ name: "Everything (mine)", type: "board", owner_id: SAM.user_uuid })
    expect(viewWrites(server)).toEqual([expect.objectContaining({ action: "create", name: "Everything (mine)", type: "board", personal: true })])
    expect(server.savedViews[0]).toMatchObject({ type: "grid", config: "{}" })
    await expect(naming).toHaveCount(0)
    const trigger = page.getByRole("button", { name: "View: Everything (mine)", exact: true })
    await expect(trigger).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`[?&]v=${mine.id}`))

    await press(trigger)
    const menu = page.getByRole("menu")
    await expect(menu).toContainText(/Everyone\s*Everything\s*Only me\s*Everything \(mine\)/)
    await expect(menu.getByRole("menuitemradio", { name: "Everything (mine)" })).toHaveAttribute("aria-checked", "true")
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)

    // Its link opens the table as the view keeps it, before anything is changed.
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByRole("button", { name: "View: Everything (mine)", exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(tab(page, "Board")).toHaveAttribute("aria-pressed", "true")
    expect(viewWrites(server)).toHaveLength(1)
    await sam.close()
  })

  test(`${device.name}, a manager saves a shared view, then locks it, after which their changes save only as their own`, async ({ browser }, testInfo) => {
    const server = deals()
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    await expect(page.getByRole("button", { name: "View: Everything", exact: true })).toBeVisible({ timeout: 30_000 })

    await press(tab(page, "Board"))
    await press((await changeActions(page)).getByRole(role, { name: "Save", exact: true }))
    await expect.poll(() => server.savedViews[0].type, { timeout: 15_000 }).toBe("board")
    expect(viewWrites(server)).toEqual([expect.objectContaining({ action: "update", view: EVERYTHING, name: "Everything", type: "board" })])
    const trigger = page.getByRole("button", { name: "View: Everything", exact: true })
    await expect(trigger).toBeVisible()

    await press(trigger)
    await press(page.getByRole("menu").getByRole("menuitem", { name: "Lock view" }))
    await expect.poll(() => server.savedViews[0].locked, { timeout: 15_000 }).toBe(true)

    await press(tab(page, "Calendar"))
    await expect(page.getByRole("button", { name: "View: Everything, changed", exact: true })).toBeVisible()
    const locked = await changeActions(page)
    await expect(locked.getByRole(role, { name: "Save as mine", exact: true })).toBeVisible()
    await expect(locked.getByRole(role, { name: "Save", exact: true })).toHaveCount(0)
    expect(viewWrites(server).map((w) => w.action)).toEqual(["update", "lock"])
    await sam.close()
  })

  // CODE-REVIEWER-53's MF2: a pick of New view left the focus on the views trigger, behind the open sheet. The menu
  // handed it back as it went, after the sheet had put it in its Name field, and a phone's keyboard went with it.
  test(`${device.name}, New view picked ${device.touch ? "by touch" : "by keyboard"} keeps the focus in its Name field`, async ({ browser }, testInfo) => {
    const sam = await deals().open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const trigger = page.getByRole("button", { name: "View: Everything", exact: true })
    await expect(trigger).toBeVisible({ timeout: 30_000 })
    if (device.touch) {
      await press(trigger)
      await press(page.getByRole("menu").getByRole("menuitem", { name: "New view" }))
    } else {
      await trigger.focus()
      await page.keyboard.press("Enter")
      await page.keyboard.press("n")
      await expect(page.getByRole("menuitem", { name: "New view" })).toBeFocused()
      await page.keyboard.press("Enter")
    }
    // The menu hands the focus on once its exit has run. The open sheet hides it from roles meanwhile, so a role query
    // finds none at once: wait for its element to go, then type as a person would.
    await expect(page.locator('[role="menu"]')).toHaveCount(0)
    const name = page.getByRole("dialog", { name: "New view" }).getByRole("textbox", { name: "Name" })
    await page.keyboard.type("Launch week")
    await expect(name).toHaveValue("Launch week")
    await expect(name).toBeFocused()
    await sam.close()
  })

  test(`${device.name}, a view's link paints in its layout first, and the views menu holds its place while its chunk comes`, async ({ browser }, testInfo) => {
    const server = deals()
    server.savedViews.push({ id: PIPELINE, table_id: server.id, name: "Pipeline", type: "board", config: "{}", position: 1 })
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 900 }, ...device.options })
    await context.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
    const page = await context.newPage()
    // The views menu's chunk (it alone carries data-table-views) waits, as on a slow line.
    const viewsMenu = await holdChunk(page, "data-table-views")
    await server.attach(page, testInfo, SAM)
    await page.goto(`/app/tables/${server.id}?v=${PIPELINE}`, { waitUntil: "domcontentloaded", timeout: 120_000 })

    // Before the chunk: the menu's place shows the linked view, and the table is its board, never the grid first.
    const standIn = page.locator("[data-views-stand-in]")
    await expect(standIn).toContainText("Pipeline", { timeout: 60_000 })
    await expect(tab(page, "Board")).toHaveAttribute("aria-pressed", "true")
    const before = await tab(page, "Grid").boundingBox()
    viewsMenu.release()
    await expect(page.getByRole("button", { name: "View: Pipeline", exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(standIn).toHaveCount(0)
    expect((await tab(page, "Grid").boundingBox())?.x).toBe(before?.x)
    await viewsMenu.done()
    await context.close()
  })

  test(`${device.name}, a change leaves every layout tab where it was and in reach, its Save and Reset ${device.touch ? "heading the views sheet" : "after the tabs"}`, async ({ browser }, testInfo) => {
    const server = deals()
    server.canManage = false
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const trigger = (name: string) => page.getByRole("button", { name, exact: true })
    await expect(trigger("View: Everything")).toBeVisible({ timeout: 30_000 })
    const tabs = ["Grid", "Board", "Calendar", "Chart"]
    const boxes = () => Promise.all(tabs.map(async (name) => (await tab(page, name).boundingBox())!))
    // Whole on the screen, and what a pointer or a finger at its centre lands on.
    const inReach = async () => {
      const width = page.viewportSize()!.width
      for (const [i, box] of (await boxes()).entries()) {
        expect(box.x, `${tabs[i]} starts on the screen`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `${tabs[i]} ends on the screen`).toBeLessThanOrEqual(width)
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent?.trim(), [box.x + box.width / 2, box.y + box.height / 2])
        expect(hit, `the centre of ${tabs[i]}`).toBe(tabs[i])
      }
    }
    await inReach()
    const before = await boxes()
    await press(tab(page, "Board"))
    await expect(trigger("View: Everything, changed")).toBeVisible()
    expect(await boxes()).toEqual(before)
    await inReach()
    // The changed dot sits right after a short name, not at the trigger's far end.
    const dotGap = await trigger("View: Everything, changed").evaluate((b) => {
      const name = b.querySelector(".truncate")!
      return name.nextElementSibling!.getBoundingClientRect().left - name.getBoundingClientRect().right
    })
    expect(dotGap, "the changed dot's gap to the name").toBeLessThanOrEqual(8)
    if (device.touch) {
      await expect(page.getByRole("button", { name: "Save as mine" })).toHaveCount(0)
      const items = (await changeActions(page)).getByRole(role)
      await expect(items.nth(0)).toHaveText("Save as mine")
      await expect(items.nth(1)).toHaveText("Reset")
      await press(items.nth(1))
    } else {
      const chart = before[3]
      for (const name of ["Save as mine", "Reset"]) {
        const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!
        expect(box.x, `${name} sits after the tabs`).toBeGreaterThan(chart.x + chart.width)
      }
      await press(page.getByRole("button", { name: "Reset", exact: true }))
    }
    await expect(trigger("View: Everything")).toBeVisible()
    expect(await boxes()).toEqual(before)
    // A view's row in the menu keeps its glyph off its name.
    await press(trigger("View: Everything"))
    const glyphGap = await page.getByRole("menu").getByRole("menuitemradio", { name: "Everything" }).evaluate((row) => {
      const name = row.querySelector(".truncate")!
      return name.getBoundingClientRect().left - name.previousElementSibling!.getBoundingClientRect().right
    })
    expect(glyphGap, "the glyph's gap to the view's name").toBeGreaterThanOrEqual(6)
    await sam.close()
  })
}

// V-53 (main's findings, 29 Oct): a view grouped and saved at 1280 opened on a
// phone with no groups. A device opened a saved view as it had last left it
// there, and one that had kept nothing showed the table as nothing: ungrouped,
// and the view "changed". A saved view looks the same on every device.
test("a view grouped and saved at 1280 opens as it's saved on another device: grouped and unchanged, at 390 by touch and at 1280", async ({ browser }, testInfo) => {
  // Five fields: a phone shows the table as a list.
  const server = new TableServer(
    [...fields, { id: "owner", name: "Owner", type: "text" }, { id: "notes", name: "Notes", type: "text" }],
    [
      { item: "Booth", stage: "To do" },
      { item: "Banner", stage: "Done" },
      { item: "Badge", stage: "To do" },
    ],
  )
  server.savedViews = [{ id: EVERYTHING, table_id: server.id, name: "Everything", type: "grid", config: "{}", position: 0 }]
  const desk = await server.open(browser, testInfo, SAM)
  const page = desk.page
  await expect(page.getByRole("button", { name: "View: Everything", exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Sort and group" }).click()
  await page.getByRole("button", { name: "Add a group" }).click()
  await page.getByRole("combobox", { name: "Group by" }).click()
  await page.getByRole("option", { name: "Stage" }).click()
  await expect(page.getByRole("listbox")).toBeHidden()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("heading", { name: "Group and sort" })).toBeHidden()
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect.poll(() => JSON.parse(server.savedViews[0].config).rules?.groups?.[0]?.field, { timeout: 15_000 }).toBe("stage")
  await expect(page.locator("tbody tr[data-group-header]")).toHaveCount(2)
  await expect(page.getByRole("button", { name: "View: Everything", exact: true })).toBeVisible()
  await desk.close()

  // Each a device of its own, with nothing kept from the one that saved it.
  for (const device of [
    { name: "390 by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, heads: "[data-table-list] li[data-group-header]" },
    { name: "1280", options: {}, heads: "tbody tr[data-group-header]" },
  ]) {
    const other = await server.open(browser, testInfo, SAM, device.options)
    const heads = other.page.locator(device.heads)
    await expect(heads, `group headers at ${device.name}`).toHaveCount(2, { timeout: 30_000 })
    await expect(heads.first()).toContainText("To do")
    await expect(heads.last()).toContainText("Done")
    await expect(other.page.locator("[data-rule-chip]").filter({ hasText: "Grouped by Stage" })).toBeVisible()
    await expect(other.page.getByRole("button", { name: "View: Everything", exact: true }), `the view unchanged at ${device.name}`).toBeVisible()
    if (process.env.SHOTS_DIR) {
      for (const colorScheme of ["light", "dark"] as const) {
        await other.page.emulateMedia({ colorScheme })
        await other.page.screenshot({ path: `${process.env.SHOTS_DIR}/saved-grouped-elsewhere-${device.name.split(" ")[0]}-${colorScheme}.png`, animations: "disabled" })
      }
    }
    await other.close()
  }
  expect(viewWrites(server).map((w) => w.action)).toEqual(["update"])
})
