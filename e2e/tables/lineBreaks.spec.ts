import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// TAB-BUG-7: a text cell was an input, which drops line breaks: an AI
// answer of several lines showed them run together, and the first edit
// saved it that way, for everyone.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "summary", name: "Summary", type: "text" },
]

test("a cell of several lines, edited and saved, keeps its line breaks", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, [{ item: "Booth", summary: "Para one\n\nPara two" }, { item: "Banner", summary: "" }])
  const sam = await server.open(browser, testInfo, SAM)
  const summary = sam.page.locator('[data-cell="0:1"]')
  await expect(summary).toHaveValue("Para one\n\nPara two")

  // While it's edited it shows every line, over the rows below.
  await summary.click()
  await expect(summary).toHaveAttribute("data-grown", "")
  const cell = await summary.locator("xpath=ancestor::td").boundingBox()
  expect((await summary.boundingBox())!.height).toBeGreaterThan(cell!.height)

  await sam.page.keyboard.press("ControlOrMeta+End")
  await sam.page.keyboard.type(" (edited)")
  await sam.page.keyboard.press("Tab")
  await expect.poll(() => server.valuesOf(0).summary, { timeout: 15_000 }).toBe("Para one\n\nPara two (edited)")
  // At rest it's its cell's height again.
  await expect(summary).not.toHaveAttribute("data-grown", "")

  // Shift+Enter adds a line; Enter saves.
  const empty = sam.page.locator('[data-cell="1:1"]')
  await empty.click()
  await sam.page.keyboard.type("First")
  await sam.page.keyboard.press("Shift+Enter")
  await sam.page.keyboard.type("Second")
  await sam.page.keyboard.press("Enter")
  await expect.poll(() => server.valuesOf(1).summary, { timeout: 15_000 }).toBe("First\nSecond")
  await sam.close()
})
