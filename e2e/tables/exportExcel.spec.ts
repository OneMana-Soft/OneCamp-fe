import { expect, test, type Locator } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables, package 2b: "Export Excel" in the table's More menu saves the view
// as the server writes it (business/DataTable xlsxExport.go). A view whose
// rules the server takes is asked for by its spec; the file is saved under
// the name the server gives. A table the reader can no longer open says so.

for (const device of [
  { name: "at 1280, by mouse", options: {}, touch: false },
  { name: "at 390, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
]) {
  const press = (target: Locator) => (device.touch ? target.tap() : target.click())

  test(`${device.name}, the view saves as an Excel workbook from the More menu`, async ({ browser }, testInfo) => {
    const server = new TableServer(
      [
        { id: "vendor", name: "Vendor", type: "text" },
        { id: "spend", name: "Spend", type: "number" },
      ],
      [
        { vendor: "Acme", spend: 1200 },
        { vendor: "Globex", spend: 800 },
      ],
    )
    server.answersQuery = true
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    await press(page.getByRole("button", { name: "More", exact: true }))
    const saved = page.waitForEvent("download")
    await press(page.getByRole("menu").getByRole("menuitem", { name: "Export Excel" }))
    expect((await saved).suggestedFilename()).toBe("Deals.xlsx")
    await expect(page.getByText("Exported to Excel")).toBeVisible()
    // Asked for by the view's spec: every row, in the table's order, the shown fields in theirs.
    expect(server.exports).toEqual([expect.objectContaining({ fields: ["vendor", "spend"], spec: {} })])
    await close()
  })

  test(`${device.name}, an export of a table the reader can no longer open says so, and saves nothing`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "vendor", name: "Vendor", type: "text" }], [{ vendor: "Acme" }])
    server.answersQuery = true
    server.exportRefused = true
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    let downloads = 0
    page.on("download", () => downloads++)
    await press(page.getByRole("button", { name: "More", exact: true }))
    await press(page.getByRole("menu").getByRole("menuitem", { name: "Export Excel" }))
    await expect(page.getByText("It's gone, or you can no longer open it.")).toBeVisible({ timeout: 20_000 })
    expect(server.exports).toHaveLength(1)
    expect(downloads).toBe(0)
    await close()
  })
}
