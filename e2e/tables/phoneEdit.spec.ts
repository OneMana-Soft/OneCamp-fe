import { expect, test, type Browser, type BrowserContext, type Locator, type TestInfo } from "@playwright/test"

import { finger } from "../finger"
import { openKeyboard, type KeyboardKind } from "../keyboard"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// The phone pair (notion-db-14, gsheets-mobile-01; 10 Nov): a table edits on a
// phone as quickly as the apps. From the list, a row's record opens on one tap
// and a field edits on the next, and the record steps to the next row without
// closing; the grid edits a cell on one tap. The record is the shared sheet
// (TABLES-BOARDS-25): a swipe down closes it. Every tap is counted.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
// Five fields and more: a phone shows the list first (lib/tables/display listByDefault).
const FIELDS = [
  { id: "item", name: "Item", type: "text" },
  { id: "amount", name: "Amount", type: "number" },
  { id: "notes", name: "Notes", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "due", name: "Due", type: "date" },
]
const rows = () => Array.from({ length: 50 }, (_, i) => ({ item: `Line ${i}`, amount: i * 10, notes: `Note ${i}`, owner: "Sam", due: "2026-11-10" }))
const RECORD = "[data-record-panel]"

/** A finger's taps, counted. */
function tapper() {
  const count = { n: 0 }
  return { count, tap: async (l: Locator) => (count.n++, l.tap()) }
}
const patches = (server: TableServer) => server.writes.filter((w) => w.kind === "patch" || w.kind === "update")

test("at 390 by touch: a row's record edits, steps to the next row and edits there, swipes away, and the grid edits a cell on one tap", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, rows())
  const sam = await server.open(browser, testInfo, SAM, PHONE)
  const page = sam.page
  const { count, tap } = tapper()
  await expect(page.locator("[data-table-list]")).toBeVisible()

  // The list's row, then its field: two taps to a caret.
  await tap(page.locator(`li[data-row="${server.rows[1].id}"] button`).first())
  const record = page.getByRole("dialog", { name: "Line 1, a row of Deals" })
  await expect(record).toBeVisible()
  await expect(record, "the shared sheet").toHaveAttribute("data-v3-sheet", "")
  await expect(record.locator("[data-drawer-handle]"), "its grabber").toHaveCount(1)
  await expect(record.locator("[data-sheet-footer]").getByRole("button", { name: "Comment" }), "Comment, pinned in its footer").toBeVisible()
  const notes = record.getByRole("textbox", { name: "Notes" })
  await tap(notes)
  await expect(notes).toBeFocused()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("Called back")
  await page.keyboard.press("Enter")
  await expect.poll(() => server.rows[1].values.notes).toBe("Called back")
  expect(count.n, "two taps to edit a row's field").toBe(2)

  // The next row, in the same sheet: one tap, and one more to its field.
  await tap(record.getByRole("button", { name: "Next row (J)" }))
  const next = page.getByRole("dialog", { name: "Line 2, a row of Deals" })
  await expect(next).toBeVisible()
  const owner = next.getByRole("textbox", { name: "Owner" })
  await tap(owner)
  await expect(owner).toBeFocused()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("Priya")
  await page.keyboard.press("Enter")
  await expect.poll(() => server.rows[2].values.owner).toBe("Priya")
  expect(count.n, "two taps more to edit the next row's field").toBe(4)
  expect(patches(server).map((w) => w.rowId)).toEqual([server.rows[1].id, server.rows[2].id])
  // The list shows both saves.
  await expect(page.locator(`li[data-row="${server.rows[1].id}"]`)).toContainText("Called back")

  // A swipe down on its grabber closes it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const grab = (await next.locator("[data-drawer-handle]").boundingBox())!
  const f = await finger(page)
  const x = grab.x + grab.width / 2
  let y = grab.y + grab.height / 2
  await f.down(x, y)
  for (let k = 0; k < 8; k++) await f.move(x, (y += 60))
  await f.up()
  await expect(page.locator(RECORD), "swiped away").toHaveCount(0)

  // The grid: a tap on a cell is its editor; type and Enter, and it's saved.
  await page.getByRole("button", { name: "Row height and colour" }).tap()
  await page.getByRole("menuitem", { name: "Show as a grid" }).tap()
  const td = page.locator('tbody tr[data-index="3"] > td[data-kind]').nth(1)
  await td.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "end" }))
  const before = count.n
  await tap(td)
  const box = td.locator("[data-cell]")
  await expect(box).toBeFocused()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("4200")
  await page.keyboard.press("Enter")
  await expect.poll(() => server.rows[3].values.amount).toBe(4200)
  expect(count.n - before, "one tap to edit a grid cell").toBe(1)
  await sam.close()
})

/** Where a field is against the keyboard's top (the visible part's bottom) and its sheet's pinned footer, and whether a
 *  finger at its middle meets it, all read in one frame: "in sight", or what was read. */
const sightOf = (field: Locator) =>
  field.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const vv = window.visualViewport!
    const footer = el.closest("[data-v3-sheet]")!.querySelector("[data-sheet-footer]")!.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const s = { bottom: Math.round(r.bottom), keyboardTop: Math.round(vv.height + vv.offsetTop), footerTop: Math.round(footer.top), meets: !!hit && el.contains(hit) }
    return s.bottom <= s.keyboardTop && s.bottom <= s.footerTop && s.meets ? "in sight" : JSON.stringify(s)
  })

/** A table whose records hold six fields, the last (City) a long way down the sheet, open at 390 by touch on row 2. */
type Row = ReturnType<typeof rows>[number]
async function cityRecord(browser: Browser, testInfo: TestInfo, prepare?: (context: BrowserContext) => Promise<unknown>, edit: (r: Row, i: number) => Row = (r) => r) {
  const server = new TableServer([...FIELDS, { id: "city", name: "City", type: "text" }], rows().map((r, i) => ({ ...edit(r, i), city: "Pune" })))
  const sam = await server.open(browser, testInfo, SAM, PHONE, undefined, prepare)
  const page = sam.page
  await expect(page.locator("[data-table-list]")).toBeVisible()
  await page.locator(`li[data-row="${server.rows[2].id}"] button`).first().tap()
  const record = page.getByRole("dialog", { name: "Line 2, a row of Deals" })
  await expect(record).toHaveAttribute("data-v3-sheet", "")
  return { server, sam, page, city: record.getByRole("textbox", { name: "City" }) }
}

test("at 390 by touch, the field being edited stays in sight over the keyboard, either kind, as an app's sheet keeps it", async ({ browser }, testInfo) => {
  // The keyboard (336px) takes the half of the screen the last field sat in. The record's sheet keeps the field in
  // sight (lib/ui/fieldInSight, in the record's own chunk, components/table/RecordPanel).
  const { server, sam, page, city } = await cityRecord(browser, testInfo)
  for (const kind of ["visual", "resize"] as KeyboardKind[]) {
    await city.tap()
    await expect(city).toBeFocused()
    const close = await openKeyboard(page, kind)
    await expect.poll(() => sightOf(city), { message: `the field being edited, over the ${kind} keyboard` }).toBe("in sight")
    // It still edits there.
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type(`Pune ${kind}`)
    await page.keyboard.press("Enter")
    await expect.poll(() => server.rows[2].values.city).toBe(`Pune ${kind}`)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await close()
  }
  await sam.close()
})

test("at 390 by touch, the field-in-sight code comes in the record's own chunk, after the page is drawn, and the field stays in sight", async ({ browser }, testInfo) => {
  // lib/ui/fieldInSight is out of the shell and the table's first load (app/firstLoad.test SHELL_LAZY): the record
  // sheet's chunk brings it, warmed once the table is drawn or asked for by the tap. Told by the selector only it holds,
  // each chunk carrying it is held 500ms, from the page's first request on, and counted so a miss can't pass. The
  // list's own chunk (told by its mark) is held 500ms too, as on a phone whose list is still on its way once the
  // table is read: what is a tap away waits for the list, not for the bundle. When each was asked for is read on the
  // page's clock against the list's draw there: this test sees the list up to a poll (500ms) after it is drawn.
  const held: string[] = []
  const { sam, page, city } = await cityRecord(browser, testInfo, (context) =>
    Promise.all([
      context.addInitScript(() => {
        performance.setResourceTimingBufferSize(2000)
        const watch = new MutationObserver(() => {
          if (!document.querySelector("[data-table-list]")) return
          watch.disconnect()
          ;(window as unknown as { listDrawnAt: number }).listDrawnAt = performance.now()
        })
        watch.observe(document, { childList: true, subtree: true })
      }),
      context.route("**/_next/static/chunks/*.js", async (route) => {
        const response = await route.fetch()
        const body = await response.text()
        const carries = body.includes("[data-overlay-body], [data-sheet-body]")
        if (carries) held.push(route.request().url())
        if (carries || body.includes(`"data-table-list":""`)) await new Promise((done) => setTimeout(done, 500))
        await route.fulfill({ response, body })
      }),
    ]),
  )
  expect(held.length, "the chunk carrying it, asked for and held").toBeGreaterThan(0)
  // A held chunk with no timing on the page counts as asked for before.
  const before = await page.evaluate((urls) => {
    const drawnAt = (window as unknown as { listDrawnAt?: number }).listDrawnAt ?? Infinity
    return urls.filter((url) => !(performance.getEntriesByName(url)[0]?.startTime >= drawnAt))
  }, held)
  expect(before, "none of it before the table is drawn").toEqual([])
  await city.tap()
  await expect(city).toBeFocused()
  await openKeyboard(page, "resize")
  await expect.poll(() => sightOf(city), { message: "the field being edited, over the resize keyboard" }).toBe("in sight")
  // The chunk route goes before the page closes (holdChunk's done()): a chunk still on its way can't fail the test.
  await page.context().unrouteAll({ behavior: "ignoreErrors" })
  await sam.close()
})

test("at 390 by touch, a tap outside the record lands on the scrim: it closes the record, and the page under takes nothing", async ({ browser }, testInfo) => {
  // Under an open sheet the page keeps pointer-events of its own (app/phone.css C5, while <body> holds Radix's none)
  // instead of inheriting that none: the scrim over it must still take every tap outside the sheet.
  const { server, sam, page, city } = await cityRecord(browser, testInfo)
  await expect(city).toBeVisible()
  const record = page.locator(RECORD)
  const top = await page.getByRole("dialog", { name: "Line 2, a row of Deals" }).evaluate((el) => el.getBoundingClientRect().top)
  const at = { x: 195, y: Math.round(top / 2) }
  const under = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest("[data-vaul-overlay]") ? "the scrim" : el?.closest("[data-app-viewport]") ? "the page" : String(el?.tagName)
  }, at)
  expect(under, `what a finger meets at ${at.x},${at.y}, over the sheet's top edge at ${Math.round(top)}`).toBe("the scrim")
  // The record's ?row= goes as it closes; the page itself stays where it was.
  const path = new URL(page.url()).pathname
  await page.touchscreen.tap(at.x, at.y)
  await expect(record).toHaveCount(0)
  expect(new URL(page.url()).pathname, "the page under the scrim took no tap").toBe(path)
  expect(patches(server)).toEqual([])
  await sam.close()
})

test("at 390 by touch, a tap outside a menu up alone closes the menu, and the page under takes nothing", async ({ browser }, testInfo) => {
  // A menu, select or popover has no scrim: while one is up alone (html[data-float], no sheet open) the page keeps the
  // pointer-events none Radix gave <body> (app/phone.css C5's float arm), so a tap outside it reaches nothing under it.
  const server = new TableServer(FIELDS, rows())
  const sam = await server.open(browser, testInfo, SAM, PHONE)
  const page = sam.page
  await expect(page.locator("[data-table-list]")).toBeVisible()
  await page.getByRole("button", { name: /^View: / }).tap()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(page.locator("html"), "a float up").toHaveAttribute("data-float", /.*/)
  await expect(page.locator("html"), "no sheet").not.toHaveAttribute("data-sheet", "open")
  const row = page.locator(`li[data-row="${server.rows[0].id}"] button`).first()
  const box = (await row.boundingBox())!
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  expect(at.y, "the list's first row shows above the menu").toBeLessThan((await menu.boundingBox())!.y)
  const under = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el?.closest("[data-app-viewport]") ? "the page" : String(el?.tagName)
  }, at)
  expect(under, `what a finger meets at ${at.x},${at.y}, over the list's first row`).not.toBe("the page")
  const url = page.url()
  await page.touchscreen.tap(at.x, at.y)
  await expect(menu).toHaveCount(0)
  await page.waitForTimeout(300)
  await expect(page.getByRole("dialog"), "the row under the tap opened no record").toHaveCount(0)
  expect(page.url(), "the page under the menu took no tap").toBe(url)
  expect(patches(server)).toEqual([])
  await sam.close()
})

test("at 390 by touch, a press of Comment stays with its row: the next row opens at its top, its comment box let be", async ({ browser }, testInfo) => {
  // CR-259 F1: the record counts the presses of its Comment, and each row's comments mount again for it; taken as a
  // press of their own, the row stepped to opened at its comment box, the caret in it and the keyboard up. The next row
  // is long (Line 3's Notes run to many lines), so its comment box starts below the sheet's fold: a press kept past its
  // row (F1Rb) asks that box into view as the row's comments mount, before their editor is in, and the sheet scrolls.
  const long = Array.from({ length: 24 }, (_, k) => `Call ${k + 1}: left a message`).join("\n")
  const { sam, page } = await cityRecord(browser, testInfo, undefined, (r, i) => (i === 3 ? { ...r, notes: long } : r))
  const record = page.getByRole("dialog", { name: "Line 2, a row of Deals" })
  const box = record.locator("[data-row-comment-box] [contenteditable=true]")
  await expect(box).toHaveCount(1)
  await record.locator("[data-sheet-footer]").getByRole("button", { name: "Comment" }).tap()
  await expect(box, "Comment: the row's box, the caret in it").toBeFocused()
  await expect.poll(() => record.locator("[data-sheet-body]").evaluate((el) => el.scrollTop), "the sheet's body down at the box").toBeGreaterThan(0)
  await record.getByRole("button", { name: "Next row (J)" }).tap()
  const next = page.getByRole("dialog", { name: "Line 3, a row of Deals" })
  await expect(next).toBeVisible()
  const nextBox = next.locator("[data-row-comment-box] [contenteditable=true]")
  await expect(nextBox).toHaveCount(1)
  const fold = await next.locator("[data-sheet-body]").evaluate((body) => ({
    box: body.querySelector("[data-row-comment-box]")!.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop,
    height: body.clientHeight,
  }))
  expect(fold.box, "the next row's comment box starts below the sheet's fold").toBeGreaterThan(fold.height)
  // Its comments settled (the box mounts with the editor's chunk): nothing has brought the box up.
  await page.waitForTimeout(300)
  expect(await next.locator("[data-sheet-body]").evaluate((el) => el.scrollTop), "the next row opens at its top").toBe(0)
  await expect(nextBox, "its comment box let be").not.toBeFocused()
  await sam.close()
})

test("at 390 by touch, a viewer's record and grid open no editor", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, rows())
  // A viewer: neither edits rows nor manages the table.
  server.canEdit = false
  server.canManage = false
  const sam = await server.open(browser, testInfo, SAM, PHONE)
  const page = sam.page
  await expect(page.locator("[data-table-list]")).toBeVisible()
  await page.locator(`li[data-row="${server.rows[1].id}"] button`).first().tap()
  const record = page.getByRole("dialog", { name: "Line 1, a row of Deals" })
  await expect(record).toHaveAttribute("data-v3-sheet", "")
  const notes = record.getByRole("textbox", { name: "Notes" })
  await notes.tap()
  await expect(notes).toHaveJSProperty("readOnly", true)
  await expect(record.getByRole("textbox", { name: "Item" }), "the title is text").toHaveCount(0)
  await record.getByRole("button", { name: "More for this row" }).tap()
  await expect(page.getByRole("menuitem", { name: "Delete this row" }), "no Delete for a viewer").toHaveCount(0)
  await page.keyboard.press("Escape")
  await record.getByRole("button", { name: "Close" }).tap()
  await expect(page.locator(RECORD)).toHaveCount(0)
  await page.getByRole("button", { name: "Row height and colour" }).tap()
  await page.getByRole("menuitem", { name: "Show as a grid" }).tap()
  const td = page.locator('tbody tr[data-index="1"] > td[data-kind]').nth(1)
  await td.tap()
  expect(await page.evaluate(() => {
    const a = document.activeElement as HTMLInputElement | null
    return !!a && a.matches("input, textarea, [contenteditable=true]") && !a.readOnly
  }), "no editor took the tap").toBe(false)
  expect(server.writes).toHaveLength(0)
  await sam.close()
})

test("at 1280 by mouse and keys, the record stays the side panel and steps by J and K", async ({ browser }, testInfo) => {
  const server = new TableServer(FIELDS, rows())
  const sam = await server.open(browser, testInfo, SAM, { viewport: { width: 1280, height: 900 } })
  const page = sam.page
  const openRow = page.getByRole("button", { name: "Open row 2", exact: true })
  await page.locator("tbody tr").filter({ has: openRow }).hover()
  await openRow.click()
  const panel = page.getByRole("dialog", { name: "Line 1, a row of Deals" })
  await expect(panel).toBeVisible()
  expect(await panel.evaluate((el) => el.tagName), "the side panel, not a sheet").toBe("ASIDE")
  await expect(panel.getByRole("button", { name: "Copy a link to this row" }), "its head keeps Copy link").toBeVisible()
  await page.keyboard.press("j")
  await expect(page.getByRole("dialog", { name: "Line 2, a row of Deals" })).toBeVisible()
  const notes = page.locator(RECORD).getByRole("textbox", { name: "Notes" })
  await notes.click()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("Keys")
  await page.keyboard.press("Enter")
  await expect.poll(() => server.rows[2].values.notes).toBe("Keys")
  await page.locator(RECORD).focus()
  await page.keyboard.press("k")
  await expect(page.getByRole("dialog", { name: "Line 1, a row of Deals" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator(RECORD)).toHaveCount(0)
  await sam.close()
})

test("V-1042 at 390 by touch: the record's comment box rests with no editor; a tap brings it in with the caret, a comment typed at once lands, and the next row's rests again", async ({ browser }, testInfo) => {
  // The record makes its comment box's editor when the box is asked for (CommentComposer's waitForUse): a sheet opened,
  // stepped through and closed makes none. The line keeps the focus (a phone's keyboard) while the editor comes in, and
  // hands it what was typed and the caret.
  const { sam, page } = await cityRecord(browser, testInfo)
  const record = page.getByRole("dialog", { name: "Line 2, a row of Deals" })
  const box = record.locator("[data-row-comment-box]")
  const line = box.getByRole("textbox", { name: "Comment on this row" })
  await expect(line).toHaveCount(1)
  await expect(box.locator(".ProseMirror"), "no editor at rest").toHaveCount(0)
  await line.scrollIntoViewIfNeeded()
  await line.tap()
  await page.keyboard.type("Booked for Friday")
  await expect(box.locator(".ProseMirror"), "the tap: the editor, the caret in it").toBeFocused()
  await expect(box.locator(".ProseMirror")).toHaveText("Booked for Friday")
  await expect(box.getByRole("textbox", { name: "Comment on this row" }), "one box by its name").toHaveCount(1)
  await record.getByRole("button", { name: "Next row (J)" }).tap()
  const next = page.getByRole("dialog", { name: "Line 3, a row of Deals" })
  await expect(next).toBeVisible()
  await expect(next.locator("[data-row-comment-box]").getByRole("textbox", { name: "Comment on this row" })).toHaveCount(1)
  await expect(next.locator("[data-row-comment-box] .ProseMirror"), "the next row's box: no editor").toHaveCount(0)
  await sam.close()
})

test("V-1225 at 390 by touch: the record's comment box shows @ beside send at rest, and a tap on it starts a mention with the keyboard's caret in the editor", async ({ browser }, testInfo) => {
  // MAIN's ruling: every composer with an editor looks the same at rest. The tap focuses the resting line in the tap
  // (a phone's keyboard comes up as for a tap on the line), the editor comes in with the caret, and the mention starts.
  const { sam, page } = await cityRecord(browser, testInfo)
  const record = page.getByRole("dialog", { name: "Line 2, a row of Deals" })
  const box = record.locator("[data-row-comment-box]")
  const at = box.getByRole("button", { name: "Mention someone" })
  await expect(box.locator(".ProseMirror"), "no editor at rest").toHaveCount(0)
  await at.scrollIntoViewIfNeeded()
  await expect(at, "@ at rest").toBeVisible()
  await at.tap()
  const editor = box.locator(".ProseMirror")
  await expect(editor, "the tap: the editor, the caret in it").toBeFocused()
  await expect(editor).toHaveText("@")
  // The list names people by their username.
  await expect(page.getByRole("listbox", { name: /^Mention/ }).getByRole("option", { name: /priya/i })).toBeVisible({ timeout: 15_000 })
  await page.keyboard.type("pri")
  await expect(editor).toHaveText("@pri")
  await sam.close()
})
