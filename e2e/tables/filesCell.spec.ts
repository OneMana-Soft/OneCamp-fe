import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "fs"

import { SAM } from "../stubbedApp"
import { FILES_HOST, TableServer } from "./tableServer"

// A files field (tables B1; an Airtable base's attachments come across as
// one): each file is a chip that opens it in the app's attachment viewer, the
// chips that fit whole show and "+N" lists the rest, and a + stores more, the
// table their place. With SHOTS_DIR set, each state is also saved for review.

const BRIEF = { id: "11111111-1111-4111-8111-111111111111", name: "Stand brief.pdf", size: 482_133, mime: "application/pdf" }
const LOGO = { id: "22222222-2222-4222-8222-222222222222", name: "Logo.png", size: 20_480, mime: "image/png" }
const PLAN = { id: "44444444-4444-4444-8444-444444444444", name: "Stand floor plan, final for the venue team.pdf", size: 1_204_224, mime: "application/pdf" }
const STORED = "33333333-3333-4333-8333-333333333333"

// Four fields, so a phone shows the grid rather than the list.
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "files", name: "Files", type: "attachment" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "due", name: "Due", type: "date" },
]
const rows = [
  { item: "Booth", files: [BRIEF, LOGO, PLAN], cost: 1200, due: "2026-10-27" },
  { item: "Banner", cost: 300 },
]

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png, of the screen alone. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png`, animations: "disabled" })
}

const filesCell = (page: Page, row: number) => page.locator(`tbody tr[data-index="${row}"] > td[data-kind]`).nth(1)

for (const theme of ["light", "dark"] as const) {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    test(`a files cell at ${viewport.width}, ${theme}: its files open, and one more is stored`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const server = new TableServer(fields, rows)
      const phone = viewport.width < 600
      const sam = await server.open(browser, testInfo, SAM, { viewport, colorScheme: theme, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
      const page = sam.page
      // The files themselves: the logo is a real picture, so the viewer shows
      // one. On the page, after the stubbed backend, which answers every
      // other host "Not in this test".
      const picture = readFileSync("public/icons/icon-circle-512.png")
      await page.route(`${FILES_HOST}/**`, (route) =>
        route.request().url().endsWith(LOGO.id)
          ? route.fulfill({ status: 200, contentType: "image/png", body: picture })
          : route.fulfill({ status: 200, contentType: "text/plain", body: "the file" }),
      )
      let uploaded: unknown = null
      await page.route("**/uploadFile", (route) => {
        const req = route.request()
        const headers = {
          "access-control-allow-origin": req.headers()["origin"] || "*",
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*",
          "access-control-allow-methods": "POST,OPTIONS",
        }
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
        uploaded = req.postData()
        return route.fulfill({ status: 200, headers, json: { msg: "ok", object_uuid: STORED } })
      })

      // Its files, by name, once the cell's chunk lands. (On a phone each
      // chip's Remove shows too, named after its file.)
      const brief = filesCell(page, 0).getByRole("button", { name: BRIEF.name, exact: true })
      await expect(brief).toBeVisible({ timeout: 30_000 })
      await shot(page, "files-cell", theme)

      // The chips that fit whole, then "+N" for the rest: never a chip cut
      // by the cell's edge, and a cut name keeps its type.
      const cell = filesCell(page, 0)
      const more = cell.locator("[data-file-more]")
      await expect(more).toBeVisible()
      const cellBox = (await cell.boundingBox())!
      for (const chip of await cell.locator("[data-file-chip]").all()) {
        const box = (await chip.boundingBox())!
        expect(box.x + box.width, "a chip inside its cell").toBeLessThanOrEqual(cellBox.x + cellBox.width)
      }
      const shownChips = await cell.locator("[data-file-chip]").count()
      await expect(more).toHaveText(`+${3 - shownChips}`)
      await more.click()
      const list = page.locator("[data-files-list]")
      await expect(list.locator("li")).toHaveCount(3)
      await shot(page, "files-cell-all", theme)
      await page.keyboard.press("Escape")
      await expect(list).toBeHidden()

      // A file opens in the app's attachment viewer, at the address the
      // server gives, and the arrow keys go between the cell's files.
      await brief.click()
      const viewer = page.getByRole("dialog")
      await expect(viewer.getByRole("heading", { name: BRIEF.name })).toBeAttached()
      if (!phone) {
        await page.keyboard.press("ArrowRight")
        await expect(viewer.getByRole("heading", { name: LOGO.name })).toBeAttached()
      }
      await shot(page, "files-cell-viewer", theme)
      await page.keyboard.press("Escape")
      await expect(viewer).toBeHidden()

      // A file picked into the empty cell is stored as the table's, and the cell keeps it.
      const empty = filesCell(page, 1)
      await empty.hover()
      await empty.locator("[data-file-input]").setInputFiles({ name: "Quote.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a quote") })
      await expect(empty.getByRole("button", { name: "Quote.pdf", exact: true })).toBeVisible()
      expect(String(uploaded)).toContain('"src_key":"table"')
      expect(String(uploaded)).toContain(`"src_value":"${server.id}"`)
      const patch = server.writes.find((w) => w.kind === "patch")
      expect((patch?.body.values as Record<string, unknown>)?.files).toEqual([{ id: STORED, name: "Quote.pdf", size: 16, mime: "application/pdf" }])
      await shot(page, "files-cell-added", theme)
      await sam.close()
    })
  }
}
