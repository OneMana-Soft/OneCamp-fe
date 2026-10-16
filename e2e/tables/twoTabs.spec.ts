import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TAB-BUG-12: a table's settings were saved whole from a page's copy. With the
// tables list open in one tab and the table in another, "Make private" in one
// and a rename from the other's older copy put the table back on show to the
// workspace. Each save now sends only what it changes.
test("a rename from an older tab leaves a table private", async ({ browser }, testInfo) => {
  const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Q4 headcount" }])
  server.name = "Restructuring"
  const tab = await server.open(browser, testInfo, SAM)

  // A second tab: the tables list, read while the table is still the workspace's.
  const list = await tab.page.context().newPage()
  await server.attach(list, testInfo, SAM)
  await list.goto("/app/tables", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(list.getByRole("link", { name: /Restructuring/ })).toBeVisible({ timeout: 60_000 })

  // The first tab makes it private.
  await tab.page.getByRole("button", { name: "More", exact: true }).click()
  await tab.page.getByRole("menuitem", { name: /Make private/ }).click()
  await expect.poll(() => server.visibility, { timeout: 15_000 }).toBe("private")

  // The list's copy still says "workspace"; a rename from it sends the name alone.
  await list.bringToFront()
  await list.getByRole("link", { name: /Restructuring/ }).hover()
  await list.getByRole("button", { name: "More for Restructuring" }).click()
  await list.getByRole("menuitem", { name: "Rename" }).click()
  const name = list.getByRole("textbox", { name: "Table name" })
  await expect(name).toBeFocused()
  await name.fill("Restructuring plan")
  await name.press("Enter")
  await expect.poll(() => server.name, { timeout: 15_000 }).toBe("Restructuring plan")

  expect(server.visibility).toBe("private")
  const saves = server.writes.filter((w) => w.kind === "table")
  expect(saves.map((w) => w.body)).toEqual([{ visibility: "private" }, { name: "Restructuring plan" }])
  await tab.close()
})
