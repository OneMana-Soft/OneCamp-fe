import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, docInfo, stubBackend } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, blockIds, openDocAs, type DocTab, type Person } from "./twoPeople"

// The hand on blocks (B1; editor.md P0-2, P0-3, P1-6, P1-14; content.md
// D10): the handle on a block's first line, the block menu by pointer and by
// keyboard alone, Tab nesting with focus kept, a drag that moves a block once
// for everyone, columns by a drag beside a block, a link that lands on its
// block, and a phone's long-press. Two people where it matters, each in a
// browser of their own on A1's relay; nothing reaches a server.

const DOC = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"

// Two browsers, a relay and a drag in each of these: on a busy machine one
// takes longer than Playwright's 30 s default.
test.describe.configure({ mode: "serial", timeout: 120_000 })

/** Types lines into the doc, a block each. */
async function write(tab: DocTab, lines: string[]) {
  await tab.body.click()
  for (const [i, line] of lines.entries()) {
    if (i) await tab.page.keyboard.press("Enter")
    await tab.page.keyboard.type(line)
  }
}

const paragraphs = (tab: DocTab) => tab.body.locator(":scope > p")
/** The paragraphs' own text: a collaborator's caret, and its name, left out. */
const texts = (tab: DocTab) =>
  paragraphs(tab).evaluateAll((els) =>
    els.map((el) => {
      const copy = el.cloneNode(true) as HTMLElement
      copy.querySelectorAll(".collaboration-cursor__caret").forEach((c) => c.remove())
      return copy.textContent ?? ""
    }),
  )
const handle = (page: Page) => page.locator(".block-handle-floating")
const grip = (page: Page) => page.getByRole("button", { name: "Drag to move or click for options" })
const menu = (page: Page) => page.locator("[data-block-menu]")
const search = (page: Page) => page.getByRole("combobox", { name: "Search actions" })

/** The pointer over a block's first line, moving as a hand does. */
async function hover(page: Page, block: Locator) {
  const box = (await block.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 2)
  await page.mouse.move(box.x + 40, box.y + 6, { steps: 3 })
  await expect(handle(page)).toHaveAttribute("data-visible", "true")
  await settled(page)
}

/** The handle has stopped gliding: its grip is where it was a moment ago. */
async function settled(page: Page) {
  let last = ""
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await grip(page).boundingBox())
        const same = now === last
        last = now
        return same
      },
      { intervals: [60, 60, 120] },
    )
    .toBe(true)
}

/**
 * Drags a block by its grip to a point, in steps a pointer takes. Without an
 * x the pointer keeps to the grip's column: the blocks land at no indent.
 */
async function drag(page: Page, block: Locator, to: { x?: number; y: number }) {
  await hover(page, block)
  const g = (await grip(page).boundingBox())!
  const x0 = g.x + g.width / 2
  await page.mouse.move(x0, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(x0, g.y + g.height / 2 + 6, { steps: 2 })
  await page.mouse.move(to.x ?? x0, to.y, { steps: 12 })
  // The drop line shows where they will land before the button comes up.
  await expect(page.locator('.block-drop-indicator[data-visible="true"]')).toHaveCount(1)
  await page.mouse.up()
}

test("the handle sits on each block's first line, to the pixel, and follows the pointer", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  await write(sam, ["# A title for the plan", "## A section", "A paragraph that says what the plan is"])
  // Where the caret's line is: the first character's box.
  const lineCentre = (block: Locator) =>
    block.evaluate((el) => {
      const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!
      const r = document.createRange()
      r.setStart(text, 0)
      r.setEnd(text, 1)
      const box = r.getBoundingClientRect()
      return (box.top + box.bottom) / 2
    })
  for (const selector of ["h1", "h2", "p"]) {
    const block = sam.body.locator(selector).first()
    await hover(sam.page, block)
    const g = (await grip(sam.page).boundingBox())!
    expect(Math.abs(g.y + g.height / 2 - (await lineCentre(block))), selector).toBeLessThanOrEqual(1)
    // In the gutter, clear of the text.
    expect(g.x + g.width).toBeLessThanOrEqual((await block.boundingBox())!.x)
  }
  // On the way to it, slowly through the gutter, it stays on its block.
  const h2 = sam.body.locator("h2").first()
  await hover(sam.page, h2)
  const hb = (await h2.boundingBox())!
  await sam.page.mouse.move(hb.x - 6, hb.y + 8, { steps: 10 })
  await expect(handle(sam.page)).toHaveAttribute("data-visible", "true")
  await settled(sam.page)
  const g2 = (await grip(sam.page).boundingBox())!
  expect(Math.abs(g2.y + g2.height / 2 - (await lineCentre(h2)))).toBeLessThanOrEqual(1)
  // A text selection being dragged puts it away (S6).
  const para = sam.body.locator("p").first()
  await hover(sam.page, para)
  const pb = (await para.boundingBox())!
  await sam.page.mouse.move(pb.x + 4, pb.y + pb.height / 2)
  await sam.page.mouse.down()
  await sam.page.mouse.move(pb.x + 120, pb.y + pb.height / 2, { steps: 4 })
  await expect(handle(sam.page)).toHaveAttribute("data-visible", "false")
  await sam.page.mouse.up()
  // So does typing (no layout read per key).
  await hover(sam.page, para)
  await sam.page.keyboard.press("End")
  await sam.page.keyboard.type(" more")
  await expect(handle(sam.page)).toHaveAttribute("data-visible", "false")
  await sam.close()
})

// A plugin added or taken away while the doc is open (a part of the page that
// loads later, such as the page guard's soft lock) makes every plugin view
// again: the handle under a pointer that hasn't moved stays where it was.
test("the handle stays under a still pointer when the editor's plugins change", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: `${DOC.slice(0, -1)}7` })
  await write(sam, ["one", "two"])
  await hover(sam.page, paragraphs(sam).first())
  const before = await grip(sam.page).boundingBox()
  await sam.page.evaluate(() => {
    type Keyed = { constructor: unknown; spec: { key?: { constructor: unknown } } }
    type Editor = { state: { plugins: Keyed[] }; registerPlugin(plugin: unknown): void; unregisterPlugin(key: unknown): void }
    const editor = (document.querySelector('.doc-editor .ProseMirror[contenteditable="true"]') as unknown as { editor: Editor }).editor
    const keyed = editor.state.plugins.find((p) => p.spec.key)!
    const PluginKey = keyed.spec.key!.constructor as new (name: string) => unknown
    const Plugin = keyed.constructor as new (spec: { key: unknown }) => unknown
    const key = new PluginKey("e2eLateArrival")
    editor.registerPlugin(new Plugin({ key }))
    editor.unregisterPlugin(key)
  })
  await expect(handle(sam.page)).toHaveAttribute("data-visible", "true")
  expect(await grip(sam.page).boundingBox()).toEqual(before)
  await sam.close()
})

test("the block menu opens from the grip, and from Ctrl+/ with the keyboard alone", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: `${DOC.slice(0, -1)}1` })
  await write(sam, ["one", "two"])

  await hover(sam.page, paragraphs(sam).first())
  await grip(sam.page).click()
  await expect(menu(sam.page)).toBeVisible()
  await expect(search(sam.page)).toBeFocused()
  await sam.page.keyboard.press("Escape")
  await expect(menu(sam.page)).toBeHidden()
  await expect(sam.body).toBeFocused()

  // Keyboard only: the caret in "two", Ctrl+/, a few letters, Enter.
  await sam.page.keyboard.press("ArrowDown")
  await sam.page.keyboard.press("Enter")
  await sam.page.keyboard.press("Control+/")
  await expect(search(sam.page)).toBeFocused()
  await sam.page.keyboard.type("dupl")
  await sam.page.keyboard.press("Enter")
  await expect(paragraphs(sam)).toHaveText(["one", "two", "two"])
  await expect(menu(sam.page)).toBeHidden()

  // Turn into, from the list beside the menu: → opens it, ↩ turns.
  await sam.page.keyboard.press("Control+/")
  await expect(search(sam.page)).toBeFocused()
  await sam.page.keyboard.press("ArrowRight")
  await expect(sam.page.getByRole("listbox", { name: "Turn into" })).toBeVisible()
  await sam.page.keyboard.press("Escape")
  await sam.page.keyboard.press("Escape")
  await expect(menu(sam.page)).toBeHidden()
  await sam.close()
})

test("Tab nests a block under the one above and keeps focus in the text", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: `${DOC.slice(0, -1)}2` })
  await write(sam, ["Parent", "Child"])
  await sam.page.keyboard.press("Tab")
  await expect(sam.body.locator('p[data-indent="1"]')).toHaveText("Child")
  await expect(sam.body).toBeFocused()
  await sam.page.keyboard.press("Shift+Tab")
  await expect(sam.body.locator("p[data-indent]")).toHaveCount(0)
  await expect(sam.body).toBeFocused()
  await sam.close()
})

test("a drag moves a block once, for both people, never a copy", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const id = `${DOC.slice(0, -1)}3`
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id })
  await write(sam, ["one", "two", "three"])
  await expect(priya.body).toContainText("three", { timeout: 15_000 })

  const three = (await paragraphs(sam).nth(2).boundingBox())!
  await drag(sam.page, paragraphs(sam).first(), { y: three.y + three.height * 0.85 })
  await expect.poll(() => texts(sam), { timeout: 15_000 }).toEqual(["two", "three", "one"])
  await expect(sam.body.locator("p[data-indent]")).toHaveCount(0)
  await expect.poll(() => texts(priya), { timeout: 15_000 }).toEqual(["two", "three", "one"])
  await expect.poll(async () => JSON.stringify(await blockIds(priya)), { timeout: 15_000 }).toBe(JSON.stringify(await blockIds(sam)))
  const ids = await blockIds(sam)
  expect(new Set(ids).size).toBe(ids.length)
  await sam.close()
  await priya.close()
})

test("a block dragged beside another makes columns, which widen and stack on a narrow screen", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: `${DOC.slice(0, -1)}4` })
  await write(sam, ["Left side of the row", "Right side"])
  const left = (await paragraphs(sam).first().boundingBox())!
  await drag(sam.page, paragraphs(sam).nth(1), { x: left.x + left.width * 0.95, y: left.y + left.height / 2 })
  const columns = sam.body.locator('[data-type="column-list"] > [data-type="column"]')
  await expect(columns).toHaveCount(2)
  await expect(columns.nth(1)).toContainText("Right side")

  // The grip between them moves width from one to the other; the block
  // handle steps aside while the pointer is on it.
  await hover(sam.page, columns.first().locator("p").first())
  const g = sam.page.locator(".doc-column-grip").first()
  const gb = (await g.boundingBox())!
  await sam.page.mouse.move(gb.x + gb.width / 2, gb.y + 10)
  await expect(handle(sam.page)).toHaveAttribute("data-visible", "false")
  await sam.page.mouse.down()
  await sam.page.mouse.move(gb.x + gb.width / 2 + 80, gb.y + 10, { steps: 8 })
  await sam.page.mouse.up()
  await expect(columns.first()).toHaveAttribute("data-width", /^\d+$/)
  const widths = await columns.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-width"))))
  expect(widths[0]).toBeGreaterThan(widths[1])
  expect(widths[0] + widths[1]).toBe(100)

  // Under 768 px they stand one above the other.
  await sam.page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => {
    const [a, b] = await sam.body.locator('[data-type="column"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    return !!a && !!b && b.top >= a.bottom - 1
  }, { timeout: 15_000 }).toBe(true)
  await sam.close()
})

test("a link to a block opens the doc at it, flashing in the sender's colour", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const id = `${DOC.slice(0, -1)}5`
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id })
  await write(sam, ["one", "two", "three"])
  const target = (await blockIds(sam))[1]
  expect(target).toBeTruthy()
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id })
  await expect(priya.body).toContainText("three", { timeout: 15_000 })
  await priya.page.evaluate((hash) => {
    window.location.hash = hash
  }, `#block-${target}~sky`)
  // The flash lasts under two seconds: one look that asks it all.
  await expect(priya.body.locator(".block-link-flash.hue-sky", { hasText: "two" })).toHaveCount(1, { timeout: 10_000 })
  await sam.close()
  await priya.close()
})

/** A doc on a phone: a touch screen 390 px wide. */
async function openOnPhone(browser: Browser, testInfo: TestInfo, relay: CollabRelay, person: Person, id: string): Promise<DocTab> {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001"),
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${id}`]: docInfo({ doc_uuid: id, doc_title: "Launch plan", doc_body: "<p></p>", edit: true }),
    "/user/profile": { msg: "ok", data: person },
    "/auth/token": { data: { token: `e2e-${person.user_name}` } },
  })
  await relay.attach(page, person.user_full_name)
  await page.goto(`/app/doc/${id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const body = page.locator('.doc-editor .ProseMirror[contenteditable="true"]')
  await expect(body).toBeVisible({ timeout: 60_000 })
  return { page, body, close: () => context.close() }
}

test("on a phone, a long-press on a block opens its sheet, whose moves keep it open", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const id = `${DOC.slice(0, -1)}6`
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id })
  await write(sam, ["one", "two", "three"])
  const phone = await openOnPhone(browser, testInfo, relay, PRIYA, id)
  await expect(phone.body).toContainText("three", { timeout: 15_000 })

  const two = (await paragraphs(phone).nth(1).boundingBox())!
  const cdp = await phone.page.context().newCDPSession(phone.page)
  const at = { x: Math.round(two.x + 20), y: Math.round(two.y + two.height / 2) }
  const sheet = phone.page.locator("[data-block-sheet]")
  // The finger stays down until the sheet is up (it opens at 500 ms).
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] })
  await expect(sheet).toBeVisible({ timeout: 15_000 })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sheet.getByRole("button", { name: "Move down" }).click()
  await expect.poll(() => texts(phone), { timeout: 15_000 }).toEqual(["one", "three", "two"])
  // Still open, for the block where it went: at the bottom it only goes up.
  await expect(sheet.getByRole("button", { name: "Move up" })).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Move down" })).toHaveCount(0)
  await expect.poll(() => texts(sam), { timeout: 15_000 }).toEqual(["one", "three", "two"])
  await sam.close()
  await phone.close()
})
