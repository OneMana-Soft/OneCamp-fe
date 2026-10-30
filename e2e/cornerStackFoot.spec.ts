import { expect, test, type Locator, type Page } from "@playwright/test"
import * as Y from "yjs"
// The board's server side, faked: fixtures for the API and one in-memory collaboration server.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { SAM, expectEveryCallAnswered, expectHomeSettled, stubBackend } from "./stubbedApp"
import { overlap, type Box } from "./boxes"
import { openKeyboard } from "./keyboard"
import { CollabRelay } from "./docs/collabRelay"
import { openDocWith } from "./docs/docWith"
import { TableServer } from "./tables/tableServer"
import { RUNNING_TASK, RUNNING_TIMER } from "./runningTimer"

// V-68 (29 Oct, the live walk of V-55): on a phone the shell's corner cards (a running timer, the keyboard tip, the
// install prompt, the demo's prompt) sat 200 px up whatever a page kept at its foot, so the demo visitor's running
// timer covered the board's notes bar and took the tap meant for Tags. One contract now (app/globals.css, the corner
// stacks): a page with bottom bars publishes their top as --mobile-drawer-h (the board's bars, a chat's composer sheet,
// the doc's Formatting bar), and on a phone every floating item sits above it. A page that publishes nothing keeps
// the stack where it was. At 390 with touch, in both themes: no corner card covers a button of the board's notes
// bar, facilitation bar or cluster (a note selected, a round on), of the doc's Formatting bar, or of a table's
// Selected rows bar.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
const TASK = RUNNING_TASK
const RUNNING = RUNNING_TIMER
const THEMES = ["light", "dark"] as const

/** The corner cards showing on the page, each by its words: a card hidden from sight (visibility) isn't one. */
async function cornerCards(page: Page): Promise<{ name: string; box: Box }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-corner-stack] > *"))
      .filter((el) => el.checkVisibility({ visibilityProperty: true }))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { name: (el.textContent || "").trim().slice(0, 40), box: { x: r.x, y: r.y, width: r.width, height: r.height } }
      })
      .filter((c) => c.box.width > 0 && c.box.height > 0),
  )
}

/** No corner card shares ground with any button of `bars`, each named in the failure. */
async function expectClearOf(page: Page, bars: Record<string, Locator>) {
  const cards = await cornerCards(page)
  expect(cards.length, "a corner card shows").toBeGreaterThan(0)
  const covered: string[] = []
  for (const [bar, loc] of Object.entries(bars)) {
    await expect(loc).toBeVisible()
    for (const button of await loc.getByRole("button").all()) {
      const b = await button.boundingBox()
      if (!b || !(await button.isVisible())) continue
      for (const c of cards) if (overlap(c.box, b)) covered.push(`"${c.name}" over ${bar}'s ${(await button.getAttribute("aria-label")) || (await button.textContent()) || "button"}`)
    }
  }
  expect(covered, "corner cards over a page's own bars").toEqual([])
}

const BOARD = "b0a4d000-0000-4000-8000-0000000000e8"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }

/** Sam, an editor, opens a board with a note, a voting round on, and a timer running; the camera at the board's origin. */
async function openBoard(page: Page) {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, boardDoc(ordered([...note("venue", 40, 140, "Book the venue")])))
  doc.getMap("facilitation").set("voting", { id: "round-v68", perPerson: 3, byId: "someone-else", byName: "Maya" })
  const board = { uuid: BOARD, title: "Sprint retro", levels: LEVELS, update: Y.encodeStateAsUpdate(doc) }
  await page.context().addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the note is then elsewhere, and the tap says so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(page.context(), {
    app: String(test.info().project.use.baseURL),
    user: USERS.sam,
    docs: [],
    collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]),
    fixtures: [[/\/task\/time\/running$/, RUNNING], ...boardFixtures([board], USERS.sam, USERS.sam)],
  })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const canvas = await page.locator(".excalidraw").first().boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")
  return canvas
}

for (const theme of THEMES) {
  test(`at 390 with touch, ${theme}: a running timer's card keeps off the board's bars, and Tags takes a tap`, async ({ browser }) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...PHONE, colorScheme: theme })
    const page = await context.newPage()
    const canvas = await openBoard(page)
    await expect(page.getByRole("status", { name: `Timer running on ${TASK}` })).toBeVisible({ timeout: 15_000 })
    const facilitation = page.getByRole("toolbar", { name: "Facilitation" })
    await expect(facilitation).toContainText("Voting")
    // A note selected: the notes bar, the board's highest.
    await page.touchscreen.tap(canvas.x + 130, canvas.y + 230)
    const bar = page.locator("[data-notes-bar]")
    await expect(bar.getByRole("toolbar", { name: "Note" })).toBeVisible()
    await expectClearOf(page, { "the notes bar": bar, "the facilitation bar": facilitation, "the cluster": page.getByRole("toolbar", { name: "Board tools" }) })
    await page.screenshot({ path: test.info().outputPath(`390-board-timer-${theme}.png`) })
    // The live walk's tap: the notes bar's Tags opens its sheet.
    await bar.getByRole("button", { name: "Tags" }).tap({ timeout: 5_000 })
    await expect(page.getByRole("textbox", { name: "Add a tag" })).toBeVisible()
    await context.close()
  })
}

const DOC = "5e1d2c3b-4a59-4687-9a0b-1c2d3e4f5a68"
for (const theme of THEMES) {
  test(`at 390 with touch, ${theme}: a running timer's card goes under the keyboard while a doc is typed in, and comes back after`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const relay = new CollabRelay()
    const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, { "/task/time/running": RUNNING }, { width: 390, height: 844, isMobile: true, hasTouch: true })
    await tab.page.emulateMedia({ colorScheme: theme })
    await expect(tab.page.getByRole("status", { name: `Timer running on ${TASK}` })).toBeVisible({ timeout: 15_000 })
    // On the first line, where a person taps: an empty doc's "Start with" list lies over the middle of the text.
    await tab.body.tap({ position: { x: 24, y: 12 } })
    const formatting = tab.page.getByRole("toolbar", { name: "Formatting" })
    await expect(formatting).toBeVisible({ timeout: 15_000 })
    const close = await openKeyboard(tab.page, "visual")
    // Typing down to the foot of what the keyboard leaves: the caret's line sits just over the Formatting bar.
    for (let i = 1; i <= 14; i++) {
      await tab.page.keyboard.type(`Line ${i}`)
      await tab.page.keyboard.press("Enter")
    }
    await expect(formatting).toBeVisible()
    // While the keyboard is up the corner cards go under it, as the tab bar does: over the Formatting bar a card sat
    // on the line being typed (V-68's design and code reviews).
    await expect.poll(async () => (await cornerCards(tab.page)).map((c) => c.name), { message: "no corner card while typing" }).toEqual([])
    await tab.page.screenshot({ path: testInfo.outputPath(`390-doc-typing-${theme}.png`) })
    // The keyboard gone (the editor lets go first, as on a phone), the card is back in its place, 200 px up.
    await tab.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await close()
    await expect(tab.page.getByRole("status", { name: `Timer running on ${TASK}` })).toBeVisible()
    const stack = tab.page.locator('[data-corner-stack="left"]')
    await expect.poll(async () => Math.round(844 - (await stack.boundingBox())!.y - (await stack.boundingBox())!.height)).toBe(200)
    await tab.page.screenshot({ path: testInfo.outputPath(`390-doc-timer-${theme}.png`) })
    await tab.close()
  })
}

const FIELDS = [
  { id: "item", name: "Item", type: "text" },
  { id: "cost", name: "Cost", type: "number" },
  { id: "owner", name: "Owner", type: "text" },
]
for (const theme of THEMES) {
  test(`at 390 with touch, ${theme}: a running timer's card keeps off a table's Selected rows bar`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const server = new TableServer(FIELDS, Array.from({ length: 40 }, (_, i) => ({ item: `Line ${i}`, cost: i * 10, owner: i % 2 ? "Maya" : "Sam" })))
    const { page, close } = await server.open(browser, testInfo, SAM, { ...PHONE, colorScheme: theme })
    await page.route(/\/task\/time\/running$/, (route) => route.fulfill({ json: RUNNING }))
    // The grid, not a phone's list; and the page again, so the timer's read is the route's.
    await page.evaluate((id) => localStorage.setItem(`onecamp:tableDisplay:${id}`, JSON.stringify({ list: false })), server.id)
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByRole("status", { name: `Timer running on ${TASK}` })).toBeVisible({ timeout: 60_000 })
    const first = page.locator("tbody tr[data-row]").first()
    await expect(first).toBeVisible({ timeout: 60_000 })
    await first.getByRole("checkbox", { name: /^Select row / }).tap()
    const selected = page.getByRole("toolbar", { name: "Selected rows" })
    await expectClearOf(page, { "the Selected rows bar": selected })
    await page.screenshot({ path: testInfo.outputPath(`390-table-timer-${theme}.png`) })
    await close()
  })
}

// A page that publishes no foot keeps its corner stack where it was: 4rem of tab bar and 8.5rem up, its card's foot
// 200 px over the screen's.
for (const theme of THEMES) {
  test(`at 390 with touch, ${theme}: on a page with no foot of its own, the timer's card stays 200 px up`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...PHONE, colorScheme: theme, baseURL: String(testInfo.project.use.baseURL || "http://localhost:3001") })
    const page = await context.newPage()
    await stubBackend(page, testInfo, {
      "/task/time/running": RUNNING,
      // Home's own reads, answered empty, so no stub's "Not found · Not in this test" toast lands in the shot (DB-35).
      "/activity/unified": { msg: "ok", data: { activities: [], has_more: false } },
      "/user/assignedTaskList": { msg: "ok", data: null },
      "/event/getEvents": { msg: "ok", data: null },
      "/project/overview": { msg: "ok", data: { projects: [] } },
      "/ch/suggested": { msg: "ok", data: [] },
      "/approvals/waiting": { msg: "ok", data: { items: [] } },
    })
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const card = page.getByRole("status", { name: `Timer running on ${TASK}` })
    await expect(card).toBeVisible({ timeout: 60_000 })
    await expectHomeSettled(page)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h").trim()), "no foot published").toBe("")
    const stack = page.locator('[data-corner-stack="left"]')
    await expect.poll(async () => Math.round(844 - (await stack.boundingBox())!.y - (await stack.boundingBox())!.height)).toBe(200)
    // Home's own reads answered, so no stub's "Not in this test" toast lands in the shot (DB-35).
    await expectEveryCallAnswered(page)
    await page.screenshot({ path: testInfo.outputPath(`390-no-foot-timer-${theme}.png`) })
    await context.close()
  })
}
