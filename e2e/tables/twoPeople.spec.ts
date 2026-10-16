import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// TAB-BUG-1: two people edit different cells of one row. A save sent the whole
// row as its page last read it, so the second person's save put the first
// person's cell back. Each edit now sends its cell alone. No live message
// reaches either page here, so each holds its copy, as when MQTT is down.

test.describe.configure({ mode: "serial" })

const fields = [
  { id: "item", name: "Deal", type: "text" },
  { id: "status", name: "Status", type: "select", config: { options: [{ id: "o_open000000", label: "Open" }, { id: "o_won0000000", label: "Won" }] } },
  { id: "notes", name: "Notes", type: "text" },
]

test("two people editing one row both keep their edit", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, [{ item: "Acme renewal", status: "Open", notes: "" }])
  const sam = await server.open(browser, testInfo, SAM)
  const priya = await server.open(browser, testInfo, PRIYA)

  // Sam marks the deal won.
  await sam.page.getByRole("button", { name: "Status: Open" }).click()
  await sam.page.getByRole("option", { name: "Won" }).click()
  await expect.poll(() => server.valuesOf(0).status, { timeout: 15_000 }).toBe("Won")

  // Priya's page still has the row as it was, and she writes a note on it.
  await expect(priya.page.getByRole("button", { name: "Status: Open" })).toBeVisible()
  const notes = priya.page.getByRole("textbox", { name: "Notes" })
  await notes.click()
  await notes.fill("Call back Friday")
  await notes.press("Tab")
  await expect.poll(() => server.valuesOf(0).notes, { timeout: 15_000 }).toBe("Call back Friday")

  // Sam's edit is still there, and every save sent one cell through the patch route.
  expect(server.valuesOf(0).status).toBe("Won")
  expect(server.writes.filter((w) => w.kind === "update")).toHaveLength(0)
  const patches = server.writes.filter((w) => w.kind === "patch")
  expect(patches).toHaveLength(2)
  for (const p of patches) expect(Object.keys(p.body.values as object)).toHaveLength(1)

  // Each sees both, once their page asks again.
  for (const tab of [sam, priya]) {
    await tab.page.reload({ waitUntil: "domcontentloaded" })
    await expect(tab.page.getByRole("button", { name: "Status: Won" })).toBeVisible({ timeout: 30_000 })
    await expect(tab.page.getByRole("textbox", { name: "Notes" })).toHaveValue("Call back Friday")
  }

  await sam.close()
  await priya.close()
})
