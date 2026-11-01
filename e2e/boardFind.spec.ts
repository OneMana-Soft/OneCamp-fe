import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server, so what Replace writes is read back from the shared
// board. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { holdChunk } from "./holdChunk"
import { settled } from "./sheetLayout"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"

// Find and replace on a board (whiteboard programme W6-B2, row miro-05): a
// search hit on a board's words opens the board with Find on those words, the
// canvas lights every match (the current one stronger), Replace all is one
// undo step, and Ctrl or Cmd+F opens it only while the board has the focus.
// Editors replace; a viewer finds.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const NAME = boardDocName(BOARD)

// A frame, "Launch week", round two notes: "launch" is in all three, "Launch
// budget" in one. Where the board opens, a note on the caterer sits under a
// phone's Find sheet, and the frame "Went well", round a note thanking the
// sponsors, is right of a computer's screen.
function theBoard(levels: Record<string, string>) {
  const budget = note("budget", 100, 150, "Launch budget")
  const venue = note("venue", 360, 150, "Venue for the launch")
  const caterer = note("caterer", 100, 520, "Book the caterer")
  const sponsors = note("sponsors", 1500, 150, "Thank the sponsors")
  const seed = ordered([...budget, ...venue, frame("week", "Launch week", [...budget, ...venue]), ...caterer, ...sponsors, frame("well", "Went well", sponsors)])
  return { uuid: BOARD, title: "Q4 launch", levels, update: boardDoc(seed) }
}

// The search hit: the passage the index marked on the board's words.
const HIT = {
  type: "board",
  board: { board_uuid: BOARD, board_title: "Q4 launch" },
  highlight: { board_text: ["Q4 plan: <mark>Launch</mark> <mark>budget</mark> and the venue"] },
}

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const VIEWPORT = `onecamp:board:viewport:${BOARD}`

type Camera = { scrollX: number; scrollY: number; zoom: number }

async function open(
  browser: Browser,
  device: keyof typeof DEVICES,
  who: "sam" | "vic",
  first: string,
  theme: (typeof SHOT_THEMES)[number],
  // The camera at the board's origin at 100%, so a jump to a match is a move.
  camera: Camera = { scrollX: 0, scrollY: 0, zoom: 1 },
) {
  const levels = { sam: "edit", vic: "view" }
  const board = theBoard(levels)
  const collab = collabFor([{ id: NAME, update: board.update, levels }])
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme })
  await context.addInitScript(
    ({ key, at }: { key: string; at: Camera }) => {
      try {
        localStorage.setItem(key, JSON.stringify(at))
        localStorage.setItem("oc_keys_tip_seen", "1")
      } catch {
        /* the test then fails on the camera, saying so */
      }
    },
    { key: VIEWPORT, at: camera },
  )
  await fakeApp(context, {
    app: String(test.info().project.use.baseURL),
    user: USERS[who],
    docs: [],
    collab,
    fixtures: [...boardFixtures([board], USERS[who], USERS.sam), [
        // The search page's one request, answered for the words it sent.
        /\/query\/search$/,
        (_path: string, _url: URL, req: { postData(): string | null }) => {
          const q = (JSON.parse(req.postData() ?? "{}") as { q?: string }).q ?? ""
          return { msg: "ok", data: { page: [HIT], totals: { board: 1 }, total: 1, has_more: false, notes: [], query: { runs: true, issues: [], text: q } } }
        },
      ],
      // Its "who knows" strip asks too: no one, as the server answers it (people is always a list).
      [/\/people\/who-knows$/, { msg: "ok", data: { query: "launch budget", considered: 0, people: [], you_hidden: false } }],
      [/\/people\/who-knows\/me$/, { msg: "ok", data: { listed: true } }],
    ],
  })
  const page = await context.newPage()
  // A crash on the page says why in the run's output, not only as an element that never shows.
  page.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}\n${e.stack ?? ""}`))
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`CONSOLE-ERROR ${m.text()}`)
  })
  await page.goto(first)
  return { context, page, collab }
}

type Shared = { id: string; text?: string; originalText?: string; name?: string | null; isDeleted?: boolean; y?: number; height?: number }
const byId = (collab: ReturnType<typeof collabFor>, id: string) => (Array.from(collab.doc(NAME).getMap("elements").values()) as Shared[]).find((e) => e.id === id)
/** A label's words as typed (its drawn text wraps to fit its note). */
const typed = (e?: Shared) => e?.originalText ?? e?.text
/** What the shared board says in the three places "launch" is written. */
const words = (collab: ReturnType<typeof collabFor>) => [byId(collab, "week")?.name, typed(byId(collab, "budget-label")), typed(byId(collab, "venue-label"))]

const cameraOf = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as Camera | null, VIEWPORT)

/**
 * The find lights as drawn: Excalidraw paints them on its interactive canvas,
 * which is clear but for its overlays, in its theme's two colours, the current
 * match stronger than the rest. The pixels of each, and the current one's box
 * on the page.
 */
async function lights(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.interactive")
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return { current: 0, other: 0, box: null }
    // Excalidraw 0.18.1 fills each match at alpha 0.4, the current one orange and the rest yellow when light, a deep
    // orange and a brown when dark. The board's container carries its theme as "theme--dark".
    const dark = !!canvas.closest(".excalidraw")?.classList.contains("theme--dark")
    const [strong, faint] = dark ? [[229, 82, 0], [99, 52, 0]] : [[255, 124, 0], [255, 226, 0]]
    const { width, height } = canvas
    const px = ctx.getImageData(0, 0, width, height).data
    // Within 30 of a colour on each channel: the canvas stores alpha premultiplied, so a read drifts by a few.
    const near = (i: number, rgb: number[]) => rgb.every((v, k) => Math.abs(px[i + k] - v) <= 30)
    let current = 0
    let other = 0
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 60) continue
      if (near(i, strong)) {
        current++
        const x = (i / 4) % width
        const y = Math.floor(i / 4 / width)
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      } else if (near(i, faint)) other++
    }
    const r = canvas.getBoundingClientRect()
    const sx = r.width / width
    const sy = r.height / height
    const box = current ? { left: r.left + x0 * sx, top: r.top + y0 * sy, right: r.left + (x1 + 1) * sx, bottom: r.top + (y1 + 1) * sy } : null
    return { current, other, box }
  })
}

/** Whether the current match is lit in the half of the board a phone's Find sheet leaves in view. */
async function litAbove(page: Page, sheet: Locator) {
  const top = (await sheet.boundingBox())!.y
  const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  const { box } = await lights(page)
  return !!box && box.top >= canvas.y && box.bottom <= top
}

/**
 * Whether a note's whole box, as the board holds it and its camera draws it, sits on a phone between the tool row that
 * floats over the board's top (Excalidraw's MobileMenu row) and the Find sheet: not only its lit words.
 */
async function noteBetween(page: Page, collab: ReturnType<typeof collabFor>, sheet: Locator, id: string) {
  const note = byId(collab, id)!
  const camera = (await cameraOf(page))!
  const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  const row = (await page.locator(".App-toolbar--mobile").boundingBox())!
  const top = canvas.y + (note.y! + camera.scrollY) * camera.zoom
  return top >= row.y + row.height && top + note.height! * camera.zoom <= (await sheet.boundingBox())!.y
}

/** Whether the current match is lit on a computer's screen, clear of the Find panel at its side. */
async function litInView(page: Page, panel: Locator) {
  const side = (await panel.boundingBox())!
  const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  const { box } = await lights(page)
  return !!box && box.left >= canvas.x && box.top >= canvas.y && box.right <= side.x && box.bottom <= canvas.y + canvas.height
}

/** Find and replace, opened by an editor from the board's toolbar menu on a computer. */
async function findFromMenu(page: Page) {
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
  await page.getByRole("menuitem", { name: "Find and replace" }).click()
  const panel = page.locator("[data-board-find]")
  await expect(panel).toBeVisible({ timeout: 30_000 })
  // The menu leaves the focus to Find's field as it goes (lib/ui/focusHandOff). Board options warms the panel's code
  // as it opens, so the field took the focus before the menu had faded, and the menu then gave it back to More:
  // whatever was typed after that went to the button (V-195, wI34).
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(panel.getByRole("textbox", { name: "Find on board" })).toBeFocused()
  return panel
}

/** A phone's Find sheet, opened from Board options as a person would, at rest. */
async function findOnPhone(page: Page) {
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await page.getByRole("button", { name: "Board options" }).tap()
  await page.getByRole("menuitem", { name: "Find and replace" }).tap()
  const sheet = page.locator("[data-board-find]")
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await settled(sheet)
  return sheet
}

/**
 * The phone's camera that puts an element's words in V-201's band: under the Find sheet's top, yet inside the canvas's
 * upper half. What sits above the canvas differs by build (the demo adds its shared-account note), and the band is half
 * of it, so a first look measures this build's canvas and resting sheet. The words go in the band's middle, at 100% or
 * smaller, so they take at most half of it.
 */
async function bandCamera(browser: Browser, theme: (typeof SHOT_THEMES)[number], id: string): Promise<Camera> {
  const { context, page, collab } = await open(browser, "phone", "sam", `/app/board/${BOARD}`, theme)
  const sheet = await findOnPhone(page)
  const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  const top = (await sheet.boundingBox())!.y
  await context.close()
  const band = canvas.y + canvas.height / 2 - top
  expect(band, "the canvas's upper half runs under the Find sheet's top").toBeGreaterThan(0)
  const words = byId(collab, id)!
  const zoom = Math.min(1, band / 2 / words.height!)
  // On screen, the words start at canvas.y + (words.y + scrollY) * zoom: here, a quarter of the band or more below the top.
  return { scrollX: 0, scrollY: (top + (band - words.height! * zoom) / 2 - canvas.y) / zoom - words.y!, zoom }
}

/** The search page's hit on the board, its passage shown, opened as a person would. */
async function openHit(page: Page, device: keyof typeof DEVICES, theme: string) {
  const row = page.locator('[data-search-row="board"]')
  await expect(row).toBeVisible({ timeout: 30_000 })
  // The passage: the board's words, the searched ones marked (two hits a space apart read as one mark).
  await expect(row.locator("[data-search-snippet]")).toContainText("Launch budget and the venue")
  await expect(row.locator("[data-search-snippet] mark")).toHaveText(["Launch budget"])
  await reviewShot(page, "board-find-search", theme)
  const title = row.locator("a[data-search-result]")
  if (device === "phone") await title.tap()
  else await title.click()
  await expect(page).toHaveURL(new RegExp(`/app/board/${BOARD}`), { timeout: 30_000 })
}

for (const theme of SHOT_THEMES) {
test(`a search hit on a board's words opens it at them: lit, listed frames first, Replace all is one undo, and Ctrl+F is the board's only while it has the focus (computer, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page, collab } = await open(browser, "computer", "sam", "/app/search?q=launch%20budget", theme)
  await openHit(page, "computer", theme)

  // Find opens on the hit's words, at the first match: the note, in its frame.
  const panel = page.locator("[data-board-find]")
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(panel).toHaveAttribute("aria-label", "Find and replace")
  const field = panel.getByRole("textbox", { name: "Find on board" })
  await expect(field).toHaveValue("Launch budget")
  const count = panel.locator("[data-board-find-count]")
  await expect(count).toHaveText("1 of 1")
  await expect(panel.locator("[data-board-find-row]")).toHaveCount(1)
  await expect(panel.locator('[data-board-find-row="budget"]')).toContainText("Note · Launch week")

  // The canvas lights the words, clear of the panel; the camera went there, never closer than 100%.
  await expect.poll(async () => (await lights(page)).current, { timeout: 10_000 }).toBeGreaterThan(40)
  await reviewShot(page, "board-find", theme)
  const lit = (await lights(page)).box!
  const side = (await panel.boundingBox())!
  expect(lit.right, "the light is clear of the Find panel").toBeLessThan(side.x)
  await expect.poll(async () => (await cameraOf(page))?.scrollX ?? 0, { timeout: 5_000 }).not.toBe(0)
  expect((await cameraOf(page))!.zoom, "a jump never zooms past 100%").toBeLessThanOrEqual(1)

  // "launch": the frame's name first, then its notes; the frame isn't lit (a name isn't drawn words), its notes are.
  await field.fill("launch")
  await expect(count).toHaveText("1 of 3")
  await expect(panel.locator("[data-board-find-row]")).toHaveCount(3)
  await expect(panel.locator("[data-board-find-row]").first()).toContainText("Frame")
  await expect.poll(async () => (await lights(page)).other, { timeout: 5_000 }).toBeGreaterThan(80)
  expect((await lights(page)).current, "a frame's name has no light").toBe(0)
  await field.press("Enter")
  await expect(count).toHaveText("2 of 3")
  await expect(panel.locator('[data-board-find-row="budget"]')).toHaveAttribute("aria-current", "true")
  await expect.poll(async () => (await lights(page)).current, { timeout: 5_000 }).toBeGreaterThan(40)

  // Replace all writes every one, for everyone. Its toast's Undo puts them all back, and so does ONE undo on the board.
  const before = words(collab)
  expect(before).toEqual(["Launch week", "Launch budget", "Venue for the launch"])
  const kickoff = ["Kickoff week", "Kickoff budget", "Venue for the Kickoff"]
  await panel.getByRole("textbox", { name: "Replace with" }).fill("Kickoff")
  await panel.getByRole("button", { name: "Replace all", exact: true }).click()
  // The toast (its words are also in the screen reader's live region), with its own Undo.
  const replaced = page.locator("li").filter({ hasText: "Replaced 3 matches" })
  await expect(replaced.getByRole("button", { name: "Undo" })).toBeVisible()
  await reviewShot(page, "board-find-replaced", theme)
  await expect.poll(() => words(collab), { timeout: 5_000 }).toEqual(kickoff)
  await expect(count).toHaveText("No results")
  await replaced.getByRole("button", { name: "Undo" }).click()
  await expect.poll(() => words(collab), { timeout: 5_000 }).toEqual(before)
  await expect(count).toHaveText(/ of 3$/)
  await panel.getByRole("button", { name: "Replace all", exact: true }).click()
  await expect.poll(() => words(collab), { timeout: 5_000 }).toEqual(kickoff)
  await page.locator('[data-testid="button-undo"]').click()
  await expect.poll(() => words(collab), { timeout: 5_000 }).toEqual(before)
  await expect(count).toHaveText(/ of 3$/)

  // Closed, its lights go.
  await panel.getByRole("button", { name: "Close find" }).click()
  await expect(panel).toHaveCount(0)
  await expect.poll(async () => { const l = await lights(page); return l.current + l.other }, { timeout: 5_000 }).toBe(0)

  // Ctrl+F with the board focused opens it, its field ready.
  const box = (await page.locator(".excalidraw").first().boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 160)
  await page.keyboard.press("Control+f")
  await expect(panel).toBeVisible()
  await expect(panel.getByRole("textbox", { name: "Find on board" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)

  // Anywhere else on the page, Ctrl+F stays the browser's: not taken, not opened.
  await page.evaluate(() => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.addEventListener("keydown", (e) => e.key.toLowerCase() === "f" && document.body.setAttribute("data-f-taken", String(e.defaultPrevented)))
  })
  await page.keyboard.press("Control+f")
  await expect(page.locator("body")).toHaveAttribute("data-f-taken", "false")
  await expect(panel).toHaveCount(0)
  await context.close()
})

test(`on a phone, Find is a sheet that stays open on a jump, and the match it goes to shows above it (phone, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, "phone", "sam", "/app/search?q=launch%20budget", theme)
  await openHit(page, "phone", theme)

  const sheet = page.locator("[data-board-find]")
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await settled(sheet)
  await expect(sheet.getByRole("textbox", { name: "Find on board" })).toHaveValue("Launch budget")
  const count = sheet.locator("[data-board-find-count]")
  await expect(count).toHaveText("1 of 1")

  // The match it went to is lit in the half of the board the sheet leaves in view.
  const above = () => litAbove(page, sheet)
  await expect.poll(above, { timeout: 10_000, message: "the current match is lit above the sheet" }).toBe(true)
  await reviewShot(page, "board-find-sheet", theme)

  // A step to the next match keeps the sheet, and that match shows above it too.
  await sheet.getByRole("textbox", { name: "Find on board" }).fill("launch")
  await expect(count).toHaveText("1 of 3")
  await sheet.getByRole("button", { name: "Next match" }).tap()
  await expect(count).toHaveText("2 of 3")
  await expect(sheet).toBeVisible()
  await expect.poll(above, { timeout: 10_000, message: "the next match is lit above the sheet" }).toBe(true)
  await sheet.locator('[data-board-find-row="venue"]').tap()
  await expect(count).toHaveText("3 of 3")
  await expect(sheet).toBeVisible()
  await expect.poll(above, { timeout: 10_000, message: "a tapped row's match is lit above the sheet" }).toBe(true)

  // A word on no note: no matches, and the words stay in the field.
  await sheet.getByRole("textbox", { name: "Find on board" }).fill("zebra")
  await expect(count).toHaveText("No results")
  await reviewShot(page, "board-find-empty", theme)

  // A sheet has no close button: a tap on its scrim, above it, closes it. The board's menu opens it again, a dialog
  // named for a screen reader.
  await page.locator("[data-v3-scrim]").tap({ position: { x: 195, y: 120 } })
  await expect(sheet).toHaveCount(0)
  await page.getByRole("button", { name: "Board options" }).tap()
  await page.getByRole("menuitem", { name: "Find and replace" }).tap()
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAccessibleName("Find and replace")
  await context.close()
})

// V-195: typing alone (no step, no row) brings the current match into view once the words settle, by the rule a
// step goes by, without selecting it: the field keeps the keys and no note's bar opens over the board.
test(`on a phone, a typed word's match under the sheet comes up above it before any step, unselected (phone, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page, collab } = await open(browser, "phone", "sam", `/app/board/${BOARD}`, theme)
  const sheet = await findOnPhone(page)
  const field = sheet.getByRole("textbox", { name: "Find on board" })
  await field.pressSequentially("caterer", { delay: 30 })
  await expect(sheet.locator("[data-board-find-count]")).toHaveText("1 of 1")
  await expect.poll(() => litAbove(page, sheet), { timeout: 10_000, message: "the typed match is lit above the sheet" }).toBe(true)
  // The whole note, its rounded top included, clears the tool row over the board's top as well as the sheet.
  const between = () => noteBetween(page, collab, sheet, "caterer")
  await expect.poll(between, { timeout: 10_000, message: "the typed match's note sits whole between the tool row and the sheet" }).toBe(true)
  await expect(field).toBeFocused()
  await expect(page.locator("[data-notes-bar]")).toHaveCount(0)
  await reviewShot(page, "board-find-typed-sheet", theme)
  // A step goes to it by the same rule, and selects it.
  await field.press("Enter")
  await expect.poll(between, { timeout: 10_000, message: "the stepped-to note sits whole between the tool row and the sheet" }).toBe(true)
  await context.close()
})

// V-201: what a phone's Find sheet leaves in view is the canvas above the sheet's top. The canvas's upper half runs
// under the sheet by half of what sits above the canvas: the board's header, and on the demo its shared-account note
// too (a band of about 75 px there, about 26 px on a customer's build). Words in that band counted as in view, so
// typing left them under the sheet.
test(`on a phone, a typed word's match just under the sheet's top comes up above it (phone, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  // The camera puts the caterer's words just under the sheet's top, measured on this build (a camera fixed for the
  // demo's layout put them above the sheet on every other build).
  const camera = await bandCamera(browser, theme, "caterer-label")
  const { context, page, collab } = await open(browser, "phone", "sam", `/app/board/${BOARD}`, theme, camera)
  const sheet = await findOnPhone(page)
  // The words, as the board holds them, start in the band: under the sheet's top, yet inside the canvas's upper half.
  const words = byId(collab, "caterer-label")!
  const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  const top = canvas.y + (words.y! + camera.scrollY) * camera.zoom
  expect(top, "the words start under the sheet's top").toBeGreaterThan((await sheet.boundingBox())!.y)
  expect(top + words.height! * camera.zoom, "the words end inside the canvas's upper half").toBeLessThanOrEqual(canvas.y + canvas.height / 2)
  await sheet.getByRole("textbox", { name: "Find on board" }).pressSequentially("caterer", { delay: 30 })
  await expect(sheet.locator("[data-board-find-count]")).toHaveText("1 of 1")
  await expect.poll(() => litAbove(page, sheet), { timeout: 10_000, message: "the typed match is lit above the sheet" }).toBe(true)
  await context.close()
})

// The sheet's top is taken from where it comes to rest, not from where it is while it rises: a search hit's link goes
// to its first match as soon as the board's words are in, which can be mid-rise. The page's animations run a hundred
// times slower here until then, so the jump surely comes while the sheet is on its way up: the sheet's frame rises
// at the tap (V-195), and on a busy machine the words came in 2 s later, when a rise twenty times slower was nearly
// done. Once the jump is checked, they run at full speed again, so the sheet comes to rest at once.
test(`on a phone, a search hit's jump while the sheet still rises lands the match above where the sheet comes to rest (phone, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, "phone", "sam", "/app/search?q=launch%20budget", theme)
  const cdp = await context.newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.01 })
  const row = page.locator('[data-search-row="board"]')
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.locator("a[data-search-result]").tap()
  const sheet = page.locator("[data-board-find]")
  await expect(sheet.locator("[data-board-find-count]")).toHaveText("1 of 1", { timeout: 30_000 })
  const rise = await sheet.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)
  expect(rise, "the sheet is still rising when Find goes to its match").toBeGreaterThan(20)
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await settled(sheet)
  await expect.poll(() => litAbove(page, sheet), { timeout: 10_000, message: "the match is lit above the sheet at rest" }).toBe(true)
  await context.close()
})

test(`a typed word's match off a computer's screen comes into view before any step, unselected, one in view stays put, and a step then selects it (computer, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, "computer", "sam", `/app/board/${BOARD}`, theme)
  const panel = await findFromMenu(page)
  const field = panel.getByRole("textbox", { name: "Find on board" })
  // A word whose match is already all in view, left of the panel: the camera stays. The board keeps its camera 400 ms
  // after it rests, so two seconds is past the settle, a glide and that.
  const before = await cameraOf(page)
  await field.pressSequentially("budget", { delay: 30 })
  await expect(panel.locator("[data-board-find-count]")).toHaveText("1 of 1")
  await expect.poll(() => litInView(page, panel), { timeout: 10_000, message: "the match in view is lit" }).toBe(true)
  await page.waitForTimeout(2_000)
  expect(await cameraOf(page), "a match already in view never moves the camera").toEqual(before)
  await field.fill("")
  await field.pressSequentially("sponsors", { delay: 30 })
  await expect(panel.locator("[data-board-find-count]")).toHaveText("1 of 1")
  await expect.poll(() => litInView(page, panel), { timeout: 10_000, message: "the typed match is lit in view, clear of the panel" }).toBe(true)
  await expect(field).toBeFocused()
  await expect(page.locator("[data-notes-bar]")).toHaveCount(0)
  await reviewShot(page, "board-find-typed", theme)
  // A step goes to it as before, and selects it: its note's bar opens.
  await field.press("Enter")
  await expect(page.locator("[data-notes-bar]")).toBeVisible()
  await context.close()
})

test(`a typed word's match under a computer's Find panel comes out from under it before any step (computer, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await open(browser, "computer", "sam", `/app/board/${BOARD}`, theme)
  const panel = await findFromMenu(page)
  await panel.getByRole("textbox", { name: "Find on board" }).pressSequentially("budget", { delay: 30 })
  await expect(panel.locator("[data-board-find-count]")).toHaveText("1 of 1")
  await expect.poll(() => litInView(page, panel), { timeout: 10_000, message: "the match in view is lit" }).toBe(true)
  // Wheel the board until those words sit under the panel, as a person panning might leave them.
  const lit = (await lights(page)).box!
  const side = (await panel.boundingBox())!
  const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  await page.mouse.move(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.6)
  await page.mouse.wheel((lit.left + lit.right) / 2 - (side.x + side.width / 2), (lit.top + lit.bottom) / 2 - (side.y + side.height / 2))
  const under = async () => {
    const b = (await lights(page)).box
    return !!b && b.left >= side.x && b.right <= side.x + side.width && b.top >= side.y && b.bottom <= side.y + side.height
  }
  await expect.poll(under, { timeout: 5_000, message: "the words sit under the panel" }).toBe(true)
  // Whole word changes what is found, so the current match is judged again, and comes out from under the panel.
  await panel.getByRole("button", { name: "Whole word" }).click()
  await expect(panel.locator("[data-board-find-count]")).toHaveText("1 of 1")
  await expect.poll(() => litInView(page, panel), { timeout: 10_000, message: "the match is lit clear of the panel" }).toBe(true)
  await reviewShot(page, "board-find-typed-under-panel", theme)
  await context.close()
})

test(`a viewer finds on a board but never replaces: no Replace, and the board's words stay (computer, ${theme})`, async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page, collab } = await open(browser, "computer", "vic", `/app/board/${BOARD}`, theme)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
  await page.getByRole("menuitem", { name: "Find on board" }).click()
  const panel = page.locator("[data-board-find]")
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(panel).toHaveAttribute("aria-label", "Find on board")
  await panel.getByRole("textbox", { name: "Find on board" }).fill("launch")
  await expect(panel.locator("[data-board-find-count]")).toHaveText("1 of 3")
  await expect(panel.getByRole("textbox", { name: "Replace with" })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: /^Replace/ })).toHaveCount(0)
  await reviewShot(page, "board-find-viewer", theme)
  // Enter steps; it never writes.
  await panel.getByRole("textbox", { name: "Find on board" }).press("Enter")
  await expect(panel.locator("[data-board-find-count]")).toHaveText("2 of 3")
  expect(words(collab)).toEqual(["Launch week", "Launch budget", "Venue for the launch"])
  // A word on no note: no matches, and the words stay in the field.
  await panel.getByRole("textbox", { name: "Find on board" }).fill("zebra")
  await expect(panel.locator("[data-board-find-count]")).toHaveText("No results")
  await reviewShot(page, "board-find-empty", theme)
  await context.close()
})

// V-195 (DB-71's MUST): on a phone that lost Find's code, the menu closed and the board said nothing for 30 s: no
// sheet, no "slow", no Try again. Now Board options asks for that code as it opens; a tap that still waits raises Find's
// frame at once with its name and the panel's shape, at about 10 s it says it's slow, with Try again, and once the code
// lands the panel fills the frame it rose in. The held chunk is the one with the panel's count (findPanel only).
for (const device of ["phone", "computer"] as const) {
  test(`on a slow line, Find's frame rises at once, says it's slow at 10 s, and the panel fills it once its code lands (${device}, ${theme})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const { context, page } = await open(browser, device, "sam", `/app/board/${BOARD}`, theme)
    const code = await holdChunk(page, "data-board-find-count")
    await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
    // Board options asks for Find's code as it opens, before Find is tapped.
    if (device === "phone") await page.getByRole("button", { name: "Board options" }).tap()
    else await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
    const warmed = await expect
      .poll(() => code.asked(), { timeout: 10_000 })
      .toBe(true)
      .then(
        () => true,
        () => false,
      )

    const item = page.getByRole("menuitem", { name: "Find and replace" })
    const tapped = Date.now()
    if (device === "phone") await item.tap()
    else await item.click()
    const frame = page.locator("[data-board-find]")
    await expect(frame, "Find's frame rises while its code is held").toBeVisible({ timeout: 5_000 })
    console.log(`V-195 ${device}: Find's frame was up ${Date.now() - tapped} ms after the tap`)
    await expect(frame).toHaveAccessibleName("Find and replace")
    await expect(frame.getByRole("status", { name: "Loading" })).toBeVisible()
    await reviewShot(page, `board-find-coming-${device}`, theme)

    // At about 10 s the slow line, with Try again, in the frame.
    const slow = frame.getByRole("alert")
    await expect(slow, "at about 10 s Find says it's slow").toBeVisible({ timeout: 20_000 })
    await expect(slow).toContainText("taking longer than it should")
    await expect(slow.getByRole("button", { name: "Try again" })).toBeVisible()
    await reviewShot(page, `board-find-slow-${device}`, theme)

    // The code lands: the panel fills the frame it rose in, the same element, so a phone's sheet rises once.
    const risen = await frame.elementHandle()
    code.release()
    await expect(frame.getByRole("textbox", { name: "Find on board" })).toBeVisible({ timeout: 15_000 })
    expect(await risen!.evaluate((el) => el.isConnected && el.matches("[data-board-find]")), "the frame the panel fills is the one that rose").toBe(true)
    await expect(frame.getByRole("alert")).toHaveCount(0)
    await expect(frame.getByRole("textbox", { name: "Replace with" })).toBeVisible()
    expect(warmed, "opening Board options asked for Find's code before Find was tapped").toBe(true)
    await context.close()
  })
}
}
