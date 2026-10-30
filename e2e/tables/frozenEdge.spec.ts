import { expect, test, type Page } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot } from "../stubbedApp"
import { TableServer } from "./tableServer"

// The grid's frozen first column, and a cell brought into view beside it (grid390; main, 28 Oct). On a phone the
// gutter and the frozen column share 184 px: where a touch gutter holds a row's checkbox and its open button it is
// 56 px, and the frozen column caps at 128 (140 beside a 44 px gutter), so a 390 px screen keeps 174 px beside them
// and a 168 px choice cell fits there whole. The grid scroller's inline-start scroll padding is the gutter plus the
// frozen column, so a cell brought into view stops beside them rather than under. A computer's grid is unchanged.

const LONG = "Exhibition booth at the spring trade fair, hall B"
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }] } },
  { id: "due", name: "Due", type: "date" },
]
const rows = () => [{ item: LONG, cost: 1200, stage: "To do", due: "2026-10-07" }, { item: "Banner", cost: 300 }]

/** The gutter's, the frozen column's and a first-row cell's left and right edges, in px. */
const edges = (page: Page, col: number) =>
  page.evaluate((c) => {
    const lr = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, width: r.width }
    }
    return {
      gutter: lr(document.querySelector("thead th[data-gutter]")!),
      frozen: lr(document.querySelector("thead th[data-frozen]")!),
      cell: lr(document.querySelectorAll('tbody tr[data-index="0"] > td[data-kind]')[c]),
    }
  }, col)

/** Scrolls the grid as far right as it goes, then brings a first-row cell into view as a browser does. */
const bringFromTheRight = (page: Page, col: number) =>
  page.evaluate((c) => {
    const grid = document.querySelector<HTMLElement>("[data-table-grid]")!
    grid.scrollLeft = grid.scrollWidth
    document.querySelectorAll<HTMLElement>('tbody tr[data-index="0"] > td[data-kind]')[c].scrollIntoView({ block: "nearest", inline: "nearest" })
  }, col)

for (const device of [
  { name: "a phone, by touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, gutter: 56, frozen: 128, shot: "frozenEdge" },
  { name: "a phone, by mouse", options: { viewport: { width: 390, height: 844 } }, gutter: 44, frozen: 140, shot: "" },
  { name: "a desktop, by mouse", options: { viewport: { width: 1280, height: 900 } }, gutter: 44, frozen: 232, shot: "frozenEdge" },
]) {
  test(`on ${device.name}, the frozen column keeps its share, and a cell brought into view stops beside it`, async ({ browser }, testInfo) => {
    const server = new TableServer(fields, rows())
    const sam = await server.open(browser, testInfo, SAM, device.options)
    const page = sam.page
    const item = page.locator('tbody tr[data-index="0"] > td[data-kind]').first()
    await expect(item).toContainText("Exhibition", { timeout: 30_000 })
    const at = await edges(page, 0)
    expect(Math.round(at.gutter.width), "the gutter's width").toBe(device.gutter)
    expect(Math.round(at.frozen.width), "the frozen column's width").toBe(device.frozen)
    expect(Math.round(at.cell.width), "the first row's frozen cell, as wide as its column").toBe(device.frozen)

    // A long name is cut short inside its column, on one line, as every text cell is: nothing of it spills over the
    // gutter or the next column.
    const name = await item.evaluate((td, long) => {
      const el = td.querySelector<HTMLElement>("[data-cell]")
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cell = td.getBoundingClientRect()
      const input = el instanceof HTMLInputElement ? el : null
      const text = (input ? input.value : el.textContent) ?? ""
      let cut = false
      if (input) {
        // A live box's text overflows inside it without widening it: the text's own width, in the box's font,
        // against the room inside its padding.
        const s = getComputedStyle(input)
        const pen = document.createElement("canvas").getContext("2d")!
        pen.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
        cut = pen.measureText(text).width > input.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)
      } else {
        // A cell at rest draws its value in a line of its own that ends in an ellipsis: the one drawn, of those that
        // hold the name.
        const line = [...td.querySelectorAll<HTMLElement>("*")].find(
          (e) => e.children.length === 0 && e.textContent === long && e.getClientRects().length > 0 && getComputedStyle(e).textOverflow === "ellipsis",
        )
        cut = !!line && line.scrollWidth > line.clientWidth
      }
      return { text, cut, left: r.left >= cell.left - 0.5, right: r.right <= cell.right + 0.5, oneLine: r.height <= cell.height + 0.5 }
    }, LONG)
    expect(name, "the long name's cell").not.toBeNull()
    expect(name!.text, "the long name, whole in the cell's value").toBe(LONG)
    expect(name!.cut, "cut short").toBe(true)
    expect(name!.left && name!.right, "inside its column").toBe(true)
    expect(name!.oneLine, "on one line").toBe(true)

    // From the far right, each cell brought into view stops whole beside the frozen column, never under it.
    for (const [col, what] of [[1, "number"], [3, "date"], [2, "choice"]] as const) {
      await bringFromTheRight(page, col)
      const e = await edges(page, col)
      expect(e.cell.left, `the ${what} cell's left edge, against the frozen column's right`).toBeGreaterThanOrEqual(e.frozen.right - 0.5)
      // Whole: its right edge inside the grid's.
      const right = await page.evaluate(() => document.querySelector("[data-table-grid]")!.getBoundingClientRect().right)
      expect(e.cell.right, `the ${what} cell's right edge, against the grid's`).toBeLessThanOrEqual(right + 0.5)
    }
    // The choice cell stays beside the frozen column for the review shot.
    if (device.shot) {
      for (const theme of SHOT_THEMES) {
        await page.emulateMedia({ colorScheme: theme })
        await reviewShot(page, device.shot, theme)
      }
    }
    await sam.close()
  })
}
