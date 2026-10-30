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

// DESIGN-BUILD-11's S2: at rest a text cell was its own box, one row tall, so
// a text longer than its column wrapped onto a second line the row cut through
// (every name at 390, by touch). What draws a text at rest draws one whole
// line, ending in "…" where it's cut or where more lines follow.
for (const phone of [false, true]) {
  test(`at ${phone ? "390 by touch" : "1280"}, a text at rest is one whole line, with … where it goes on`, async ({ browser }, testInfo) => {
    const long = "Power cables and extension leads for the booth at the spring fair"
    const server = new TableServer(fields, [{ item: long, summary: "Para one\nPara two" }, { item: "Booth", summary: "One line" }])
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL),
      viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    })
    await context.addInitScript((id) => {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false, widths: { item: 160, summary: 160 } }))
    }, server.id)
    const page = await context.newPage()
    await server.attach(page, testInfo, SAM)
    await page.goto(`/app/tables/${server.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator('[data-cell="1:1"]')).toBeAttached({ timeout: 60_000 })

    // What draws a cell's text at rest: the face over its box, or else the box
    // itself. It may not hold a line its row cuts, nor draw over the other.
    const atRest = (cell: string) =>
      page.locator(`[data-cell-box]:has(> [data-cell="${cell}"])`).evaluate((box) => {
        const area = box.querySelector<HTMLTextAreaElement>("[data-cell]")!
        const cover = box.querySelector<HTMLElement>(":scope > [aria-hidden]")
        const face = cover && getComputedStyle(cover).display !== "none" ? (cover.firstElementChild as HTMLElement | null) : null
        const drawn: HTMLElement = face ?? area
        return {
          text: face ? face.textContent : area.value,
          cut: drawn.scrollHeight > drawn.clientHeight + 1,
          twice: face !== null && getComputedStyle(area).color !== "rgba(0, 0, 0, 0)",
          ellipsis: getComputedStyle(drawn).textOverflow === "ellipsis" && drawn.scrollWidth > drawn.clientWidth,
        }
      })
    expect(await atRest("0:0"), "a name longer than its column").toEqual({ text: long, cut: false, twice: false, ellipsis: true })
    expect(await atRest("0:1"), "a text of two lines").toEqual({ text: "Para one…", cut: false, twice: false, ellipsis: false })
    expect(await atRest("1:1"), "a text that fits").toEqual({ text: "One line", cut: false, twice: false, ellipsis: false })

    // Opened, the box shows every line again, over the rows below. A finger
    // lands on the cell: under one, a text box takes no tap until it has the
    // focus (table.css).
    const summary = page.locator('[data-cell="0:1"]')
    if (phone) await page.locator('[data-cell-box]:has(> [data-cell="0:1"])').tap()
    else await summary.click()
    await expect(summary).toHaveAttribute("data-grown", "")
    await expect(summary).toHaveValue("Para one\nPara two")
    await context.close()
  })
}
