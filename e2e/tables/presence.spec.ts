import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"

// Who else is on a table, and where (tables A7, Live Rows #65): their faces in
// the header, a ring in their hue on the cell each has selected, and a tag
// with the name of whoever is editing one, hung outside the cell so its value
// shows whole. Pointing at a selected cell names its person; clicking a face
// goes to that person's cell. With SHOTS_DIR set, each state is also saved
// for review.

const NAME = "1b4e28ba-2fa1-41d2-883f-0016d3cca427"
const STAGE = "2c5f39cb-3ab2-42e3-994a-1127e4ddb538"
const COST = "3d6a4adc-4bc3-43f4-a05b-2238f5eec649"
const DUE = "4e7b5bed-5cd4-44a5-b16c-3349a6ffd75a"
const fields = [
  { id: NAME, name: "Item", type: "text" },
  { id: STAGE, name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: COST, name: "Cost", type: "number" },
  { id: DUE, name: "Due", type: "date" },
]
const rows = [
  { [NAME]: "Booth", [STAGE]: "To do", [COST]: 1200, [DUE]: "2026-10-27" },
  { [NAME]: "Banner", [STAGE]: "Done", [COST]: 300 },
  { [NAME]: "Stand lights", [COST]: 640 },
]

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png`, animations: "disabled" })
}

/** A cell's name tag as drawn (its ::before), and the height it's placed in (the cell's, inside its hairline). */
function tagOf(cell: Locator) {
  return cell.evaluate((td) => {
    const s = getComputedStyle(td, "::before")
    return { content: s.content, top: s.top, bottom: s.bottom, ink: s.color, ground: s.backgroundColor, cell: td.clientHeight }
  })
}

/** An edge offset that puts the tag past the cell's far edge, all but the 2 px it lays on the ring. */
function pastTheCell(offset: string, cell: number): boolean {
  return offset.endsWith("px") ? parseFloat(offset) >= cell - 2.5 : offset.replace(/\s+/g, "") === "calc(100%-2px)"
}

/** WCAG's contrast between two computed rgb() colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const x = Number(v) / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`others on a table at ${viewport.width}, ${theme}: their faces, and their cells marked`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const server = new TableServer(fields, rows)
      server.here = [
        { user: SAM.user_uuid, row: server.rows[2].id, field: DUE, at: Date.now() },
        { user: "5f8c6cfe-6de5-45b6-c27b-445ab70ae86b", name: "Maya Chen", row: server.rows[0].id, field: COST, editing: true, at: Date.now() },
        { user: PRIYA.user_uuid, name: PRIYA.user_full_name, row: server.rows[1].id, field: STAGE, at: Date.now() },
        { user: "6a9d7d0f-7ef0-46c7-938c-556bf81fc87c", name: "Jon Wu", row: server.rows[2].id, field: NAME, editing: true, at: Date.now() },
      ]
      const phone = viewport.width < 600
      const sam = await server.open(browser, testInfo, SAM, { viewport, colorScheme: theme, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
      const page = sam.page
      // Three others (not Sam himself).
      const faces = page.locator("[data-table-presence] [data-participant]")
      await expect(faces).toHaveCount(3, { timeout: 30_000 })
      const cell = (row: number, field: string) => page.locator(`tr[data-row="${server.rows[row].id}"] > td[data-field="${field}"]`)

      // Maya's cell, being edited: ringed, and tagged with her name. On the
      // first row, under the header, the tag hangs from the cell's bottom
      // edge, outside it: "1,200" read "1,2…" under a tag inside it.
      const mayas = cell(0, COST)
      await expect.poll(async () => mayas.evaluate((td) => getComputedStyle(td).boxShadow)).toContain("inset")
      const maya = await tagOf(mayas)
      expect(maya.content).toBe('"Maya"')
      expect(pastTheCell(maya.top, maya.cell), JSON.stringify(maya)).toBe(true)
      // Jon's, a frozen cell further down: his tag hangs on its top edge.
      const jon = await tagOf(cell(2, NAME))
      expect(jon.content).toBe('"Jon"')
      expect(pastTheCell(jon.bottom, jon.cell), JSON.stringify(jon)).toBe(true)
      // Each tag reads at 4.5:1 or more (white on the hue was under 3:1).
      for (const t of [maya, jon]) expect(contrast(t.ink, t.ground), `${t.content}: ${t.ink} on ${t.ground}`).toBeGreaterThanOrEqual(4.5)

      // Priya's, selected: ringed, and named only while it's pointed at.
      const priyas = cell(1, STAGE)
      await expect.poll(async () => priyas.evaluate((td) => getComputedStyle(td).boxShadow)).toContain("inset")
      expect((await tagOf(priyas)).content).toBe("none")
      await shot(page, "presence", theme)
      if (!phone) {
        await priyas.hover()
        await expect.poll(async () => (await tagOf(priyas)).content).toBe('"Priya"')
        await shot(page, "presence-hover", theme)

        // Maya's face goes to her cell and selects it, shut: no box opens on
        // the cell she's typing in, its value stays as it reads ("1,200"),
        // and her tag stays.
        await page.getByRole("button", { name: "Go to Maya Chen's cell" }).click()
        await expect(mayas.locator("[data-cell-box]")).toBeFocused()
        await expect(mayas.locator("[data-cell]")).not.toBeFocused()
        await expect(mayas).toContainText("1,200")
        expect((await tagOf(mayas)).content).toBe('"Maya"')
        await shot(page, "presence-went", theme)
        // A typed key opens the box to replace what's there; Escape puts it back.
        await page.keyboard.press("9")
        await expect(mayas.locator("[data-cell]")).toBeFocused()
        await expect(mayas.locator("[data-cell]")).toHaveValue("9")
        await page.keyboard.press("Escape")
        await expect(mayas.locator("[data-cell]")).toHaveValue("1200")
      }
      await sam.close()
    })
  }
}
