import { expect, test, type Locator } from "@playwright/test"

import { SAM, reviewShot } from "../stubbedApp"
import { TableServer } from "./tableServer"
import { expectTouchSize } from "../touchTarget"

// H2b-3: a deleted view went for good in the app, while the API's trash kept it
// and brought it back (tables.trash.restore). The app's trash now lists a
// table's deleted views beside its rows and columns, each with its layout and
// Restore, and a restored view is back in the views menu. A reader who doesn't
// write the table's rows still opens the trash, for their own views only.
// Every request is answered here; nothing reaches a server.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
]
const EVERYTHING = "5a7e0000-0000-4000-8000-0000000000aa"
const PIPELINE = "5a7e0000-0000-4000-8000-0000000000bb"
const MINE = "5a7e0000-0000-4000-8000-0000000000cc"

function deals() {
  const server = new TableServer(fields, [{ item: "Booth", stage: "To do" }, { item: "Banner", stage: "Done" }])
  server.savedViews = [
    { id: EVERYTHING, table_id: server.id, name: "Everything", type: "grid", config: "{}", position: 0 },
    { id: PIPELINE, table_id: server.id, name: "Pipeline", type: "board", config: "{}", position: 1 },
  ]
  return server
}

for (const device of [
  { name: "at 1280, by mouse", options: {}, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())

  test(`${device.name}, a manager deletes a shared view, finds it in the table's trash and brings it back to the views menu`, async ({ browser }, testInfo) => {
    const server = deals()
    const { page, close } = await server.open(browser, testInfo, SAM, device.options, PIPELINE)
    await press(page.getByRole("button", { name: "View: Pipeline", exact: true }))
    await press(page.getByRole("menu").getByRole("menuitem", { name: "Delete view" }))
    await expect(page.getByText("It's gone for everyone who opens this table. The table and its rows stay. It waits in the table's trash, until you bring it back.")).toBeVisible()
    await press(page.getByRole("button", { name: "Delete view", exact: true }))
    await expect.poll(() => server.deletedViews.map((v) => v.id), { timeout: 15_000 }).toEqual([PIPELINE])
    await expect(page.getByRole("button", { name: "View: Everything", exact: true })).toBeVisible({ timeout: 30_000 })

    await press(page.getByRole("button", { name: "More", exact: true }))
    await press(page.getByRole("menuitem", { name: "Trash" }))
    const trash = page.getByRole("region", { name: "Deleted views" })
    await expect(trash).toBeVisible({ timeout: 60_000 })
    await expect(trash.getByText("Pipeline", { exact: true })).toBeVisible()
    await expect(trash.locator("[data-trash-item] p").nth(1)).toHaveText(/^Deleted .+$/)
    const restore = trash.getByRole("button", { name: "Restore Pipeline" })
    if (device.touch) {
      const box = await restore.boundingBox()
      expectTouchSize(box && Math.min(box.width, box.height), "a view's Restore is a full touch target")
    }
    await reviewShot(page, `tables-views-trash-${device.touch ? "390" : "1280"}`, "light")
    await page.emulateMedia({ colorScheme: "dark" })
    await reviewShot(page, `tables-views-trash-${device.touch ? "390" : "1280"}`, "dark")
    await page.emulateMedia({ colorScheme: "light" })

    await press(restore)
    await expect.poll(() => server.restores, { timeout: 15_000 }).toEqual([{ views: [PIPELINE] }])
    await expect(page.getByText("Restored the view “Pipeline”", { exact: true })).toBeVisible()
    await expect(page.getByText("The trash is empty")).toBeVisible()
    await press(page.getByRole("button", { name: "Done", exact: true }))

    // The page reads the table again: the view is back in the menu, and opens.
    await press(page.getByRole("button", { name: "View: Everything", exact: true }))
    await press(page.getByRole("menu").getByRole("menuitemradio", { name: "Pipeline" }))
    await expect(page.getByRole("button", { name: "View: Pipeline", exact: true })).toBeVisible({ timeout: 30_000 })
    await close()
  })

  test(`${device.name}, a reader who doesn't edit the table brings back a view of their own from the trash`, async ({ browser }, testInfo) => {
    const server = deals()
    server.canEdit = false
    server.canManage = false
    server.deletedViews = [{ id: MINE, table_id: server.id, name: "My week", type: "calendar", config: "{}", position: 2, owner_id: SAM.user_uuid, deleted_at: new Date().toISOString() }]
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    await press(page.getByRole("button", { name: "Trash", exact: true }))
    const dialog = page.getByRole("dialog", { name: "Trash" })
    await expect(dialog.getByText("Your views deleted from this table, newest first.")).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByText("Deleted just now · only you see it")).toBeVisible()
    await expect(dialog.getByRole("region", { name: "Deleted rows" })).toHaveCount(0)
    await press(dialog.getByRole("button", { name: "Restore My week" }))
    await expect.poll(() => server.restores, { timeout: 15_000 }).toEqual([{ views: [MINE] }])
    await expect(dialog.getByText("The trash is empty")).toBeVisible()
    await expect.poll(() => server.savedViews.map((v) => v.id)).toEqual([EVERYTHING, PIPELINE, MINE])
    await close()
  })
}
