import { expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { displayNameOf } from "../lib/personName"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { boxOf, type Box } from "./boxes"
import { CHUNKS, routeChunks, type ChunkAnswer } from "./holdChunk"
import { settled } from "./sheetLayout"

// The facilitation bar (components/board/boardFacilitation): a round of
// voting, a timer and presenting, from one bar at the board's foot. On a
// phone, once anything is on, each part says only its state and every action
// is in one menu, an action sheet there: with the actions in the row, a round
// ran the bar to ~440 px at 390 and cut "Present" at "Pre" (design review,
// 29 Oct). On a computer the row keeps them all.

const BOARD = "b0a4d000-0000-4000-8000-0000000000c7"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }
const ROUND = "r1"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Timer = { endsAt: number; durationMs: number; pausedLeftMs?: number; byName: string }
type Voting = { id: string; perPerson: number; byId: string; byName: string; closedAt?: number }

/** A board of two notes (three with `third`) on one collaboration server, for everyone who opens it. */
function shareBoard(levels: Record<string, string> = LEVELS, third = false) {
  const notes = [
    ...note("venue", 40, 120, "Book the venue"),
    ...note("recap", 240, 120, "Send the recap"),
    ...(third ? note("menu", 440, 120, "Pick the menu") : []),
  ]
  const board = { uuid: BOARD, title: "Sprint retro", levels, update: boardDoc(ordered(notes)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

/**
 * `user` (Sam unless said) opens the board on `device`; `on` shares one board, and its collaboration, between screens.
 * `route` sets the screen's connection up before the board is asked for: a slow chunk, or one that can't come.
 */
async function open(
  browser: Browser,
  device: keyof typeof DEVICES,
  o: { on?: ReturnType<typeof shareBoard>; user?: typeof USERS.sam; route?: (context: BrowserContext) => Promise<void> } = {},
) {
  const { board, collab } = o.on ?? shareBoard()
  const user = o.user ?? USERS.sam
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(
    (key: string) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        // The camera at the board's origin, so the notes are where they were drawn.
        localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      } catch {
        /* the notes are then elsewhere, and the test says so */
      }
    },
    `onecamp:board:viewport:${BOARD}`,
  )
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: [...boardFixtures([board], user, USERS.sam)] })
  await o.route?.(context)
  const page = await context.newPage()
  // A held or refused chunk holds the page's load event, so a routed screen waits for the board itself instead.
  await page.goto(`/app/board/${BOARD}`, o.route ? { waitUntil: "domcontentloaded" } : undefined)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const shared = () => collab.doc(NAME).getMap("facilitation")
  return {
    context,
    page,
    bar: page.getByRole("toolbar", { name: "Facilitation" }),
    timer: () => shared().get("timer") as Timer | undefined,
    voting: () => shared().get("voting") as Voting | undefined,
    // As Lee would, from another screen: the change reaches this one over the live board.
    lee: (key: string, value: unknown) => collab.edit(NAME, (doc: { getMap: (name: string) => { set: (k: string, v: unknown) => void } }) => doc.getMap("facilitation").set(key, value)),
  }
}

/**
 * The bar is one row inside the screen that never scrolls, and every control in it is whole inside it.
 * So is every word: each text's box lies inside its segment's box, the bar's, and any box that clips it.
 * At 390 a viewer's bar read "Following · started vo… · 4:58", its names cut to nothing (design review,
 * 29 Oct). A name may give way (data-bar-name), but it keeps its first letter and its "…". Each call
 * prints the bar's segments, for the record.
 */
async function whole(page: Page, width: number) {
  const bar = page.getByRole("toolbar", { name: "Facilitation" })
  const box = await boxOf(bar)
  expect(box.height, "one row").toBeLessThanOrEqual(44.5)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(await bar.evaluate((el) => el.scrollWidth - el.clientWidth), "the bar scrolls").toBeLessThanOrEqual(0.5)
  // A viewer's bar may hold no button, only its words and the timer: each of them is whole inside the bar.
  const controls = await bar.getByRole("button").or(bar.getByRole("timer")).all()
  expect(controls.length).toBeGreaterThan(0)
  for (const control of controls) {
    const c = await boxOf(control)
    const name = (await control.getAttribute("aria-label")) ?? (await control.innerText())
    expect(c.x, `"${name}" starts inside the bar`).toBeGreaterThanOrEqual(box.x - 0.5)
    expect(c.x + c.width, `"${name}" ends inside the bar`).toBeLessThanOrEqual(box.x + box.width + 0.5)
  }
  // No word on the bar is cut short, a state's own least of all: beside Results at 390 "Presenting" read
  // "Pres…" (DB-34, M1). A text's box is measured whole (a Range runs past the box that clips it), so a
  // word cut by any box around it is found, not only by its own. A long name or a note's words may give
  // way, so those are marked data-bar-name: they keep at least their first letter and the "…".
  const { segments, cut } = await bar.evaluate((el) => {
    const span = (b: DOMRect) => `${Math.round(b.left)}-${Math.round(b.right)}`
    const within = (a: DOMRect, b: DOMRect) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5
    const pen = document.createElement("canvas").getContext("2d")
    const barBox = el.getBoundingClientRect()
    const segmentOf = (e: Element) => e.closest("[data-bar-segment]") ?? [...el.children].find((c) => c.contains(e)) ?? el
    const cut: string[] = []
    const texts = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = texts.nextNode(); t; t = texts.nextNode()) {
      const words = (t.textContent ?? "").trim()
      const at = t.parentElement
      if (!words || !at || at.closest(".sr-only")) continue
      const segment = segmentOf(at)
      const segmentBox = segment.getBoundingClientRect()
      const name = at.closest<HTMLElement>("[data-bar-name]")
      if (name) {
        const nameBox = name.getBoundingClientRect()
        if (!within(nameBox, segmentBox) || !within(nameBox, barBox)) cut.push(`the name "${words}" (${span(nameBox)}) is outside its segment (${span(segmentBox)})`)
        if (name.scrollWidth > name.clientWidth + 0.5 && pen) {
          pen.font = getComputedStyle(name).font
          const least = pen.measureText(`${[...words][0]}…`).width
          if (name.clientWidth < least - 0.5) cut.push(`the name "${words}" shows ${name.clientWidth} px, under its first letter and "…" (${Math.ceil(least)} px)`)
        }
        continue
      }
      const range = document.createRange()
      range.selectNodeContents(t)
      const textBox = range.getBoundingClientRect()
      const holders: [string, Element][] = [
        ["its segment", segment],
        ["the bar", el],
      ]
      for (let a: Element | null = at; a && a !== el; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") holders.push(["the box that clips it", a])
      const out = holders.find(([, h]) => !within(textBox, h.getBoundingClientRect()))
      if (out) cut.push(`"${words}" (${span(textBox)}) runs out of ${out[0]} (${span(out[1].getBoundingClientRect())})`)
    }
    const segments = [...el.children]
      .filter((c) => c.getAttribute("aria-hidden") !== "true")
      .map((c) => `${span(c.getBoundingClientRect())} ${(c as HTMLElement).innerText.replace(/\s+/g, " ").trim()}`)
    return { segments, cut }
  })
  console.log(`the facilitation bar at ${width}: ${segments.join(" | ")}`)
  // Soft, so one run names every state that cuts a word; the test still fails on each.
  expect.soft(cut, "words cut short on the bar").toEqual([])
}

test("on a phone, every control on the facilitation bar is whole in one row: idle, a round, a timer, presenting and the results", async ({ browser }) => {
  test.setTimeout(150_000)
  const b = await open(browser, "phone")
  // Idle: the three ways to start fit, in the bar.
  await expect(b.bar.getByRole("button", { name: "Present" })).toBeVisible()
  await whole(b.page, 390)

  // Lee starts a round: the bar says how many votes are left, and its actions wait in the menu.
  b.lee("voting", { id: ROUND, perPerson: 3, byId: "lee", byName: "Lee" })
  await expect(b.bar.getByText("3 left")).toBeVisible()
  await whole(b.page, 390)
  await expect(b.bar.getByRole("button", { name: "End voting" })).toHaveCount(0)

  // A timer, from the menu: a sheet, its Timer a step of minutes.
  const actions = b.bar.getByRole("button", { name: "Facilitation options" })
  await actions.tap()
  await b.page.getByRole("menuitem", { name: "Timer" }).tap()
  await b.page.getByRole("menuitem", { name: "5 min", exact: true }).tap()
  await expect.poll(() => b.timer()?.durationMs).toBe(5 * 60_000)
  await expect(b.bar.getByRole("timer")).toBeVisible()
  await whole(b.page, 390)

  // Presenting as well: all three at once, still whole.
  await actions.tap()
  await expect(b.page.getByRole("menuitem", { name: "End voting" })).toBeVisible()
  await b.page.getByRole("menuitem", { name: "Present" }).tap()
  await expect(b.bar.getByText("Presenting")).toBeVisible()
  await whole(b.page, 390)

  // +1 min, from the menu, is everyone's.
  await actions.tap()
  await b.page.getByRole("menuitem", { name: "+1 min" }).tap()
  await expect.poll(() => b.timer()?.durationMs).toBe(6 * 60_000)

  // A vote on the venue note, then End voting: the results, whole too, open as a sheet.
  await b.page.getByRole("button", { name: "Vote for Book the venue" }).tap()
  await actions.tap()
  await b.page.getByRole("menuitem", { name: "End voting" }).tap()
  await expect.poll(() => typeof b.voting()?.closedAt).toBe("number")
  const results = b.bar.getByRole("button", { name: "Results" })
  await expect(results).toBeVisible()
  await whole(b.page, 390)
  await results.tap()
  const sheet = b.page.getByRole("dialog").filter({ hasText: "Results" })
  await expect(sheet.getByRole("button", { name: /Book the venue/ })).toBeVisible()
  await sheet.getByRole("button", { name: /Book the venue/ }).tap()
  await expect(sheet).toHaveCount(0)

  // Lee's timer runs out on another screen: the crowded bar (Presenting · Results · Time's up) is still
  // whole, and its menu dismisses the timer.
  b.lee("timer", { endsAt: Date.now() - 1_000, durationMs: 5 * 60_000, byName: "Lee" })
  await expect(b.bar.getByRole("timer")).toHaveText("Time's up")
  await whole(b.page, 390)
  await actions.tap()
  await b.page.getByRole("menuitem", { name: "Dismiss the timer" }).tap()
  await expect.poll(() => b.timer() ?? null).toBeNull()
  await expect(b.bar.getByRole("timer")).toHaveCount(0)

  // Stop presenting, from the menu.
  await actions.tap()
  await b.page.getByRole("menuitem", { name: "Stop presenting" }).tap()
  await expect(b.bar.getByText("Presenting")).toHaveCount(0)
  await b.context.close()
})

// The bar as the others on the board see it, at 390 (design review, 29 Oct): a viewer is told who started the
// round, follows whoever presents, stops and follows again from the menu, and a round nobody voted in says so,
// in a sheet at 390 and above the bar at 1280. Two screens on one board: Ann edits at 1280, Vic views at 390.
// Vic, not Sam: the board is Sam's, and an owner always edits, whatever the levels say.
test("on a phone, the bar as the others see it: who started the round, following a presenter, and a round nobody voted in", async ({ browser }) => {
  test.setTimeout(180_000)
  const on = shareBoard({ vic: "view", ann: "edit" })
  // The board names a person by their display name first (lib/personName): Ann's is "ann".
  const ANN = displayNameOf(USERS.ann)
  const ann = await open(browser, "computer", { on, user: USERS.ann })
  const vic = await open(browser, "phone", { on, user: USERS.vic })

  // Lee starts a round and a timer from a third screen: a viewer's bar says who started the round.
  vic.lee("voting", { id: ROUND, perPerson: 3, byId: "lee", byName: "Lee" })
  vic.lee("timer", { endsAt: Date.now() + 5 * 60_000, durationMs: 5 * 60_000, byName: "Lee" })
  await expect(vic.bar).toContainText("Lee started voting")
  await expect(vic.bar.getByRole("timer")).toBeVisible()
  await whole(vic.page, 390)

  // Ann presents from her computer, and the phone follows her.
  await ann.bar.getByRole("button", { name: "Present", exact: true }).click()
  await expect(vic.bar).toContainText(`Following ${ANN}`)
  await whole(vic.page, 390)

  // Stop following, from the menu: the bar says who is presenting, and the menu follows her again.
  const actions = vic.bar.getByRole("button", { name: "Facilitation options" })
  await actions.tap()
  await vic.page.getByRole("menuitem", { name: "Stop following" }).tap()
  await expect(vic.bar).toContainText(`${ANN} is presenting`)
  await whole(vic.page, 390)
  await actions.tap()
  await vic.page.getByRole("menuitem", { name: `Follow ${ANN}` }).tap()
  await expect(vic.bar).toContainText(`Following ${ANN}`)

  // Lee ends the round, and nobody voted: Results says so, in a sheet at 390 and above the bar at 1280.
  vic.lee("voting", { id: ROUND, perPerson: 3, byId: "lee", byName: "Lee", closedAt: Date.now() })
  const results = vic.bar.getByRole("button", { name: "Results", exact: true })
  await expect(results).toBeVisible()
  await whole(vic.page, 390)
  await results.tap()
  await expect(vic.page.getByRole("dialog").filter({ hasText: "Results" })).toContainText("Nobody voted.")
  await ann.bar.getByRole("button", { name: "Results", exact: true }).click()
  await expect(ann.page.getByRole("dialog")).toContainText("Nobody voted.")
  await whole(ann.page, 1280)
  await vic.context.close()
  await ann.context.close()
})

test("on a computer, the facilitation bar keeps each action in its row, starts from menus, and shows the results above it", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "computer")
  // A timer, from the Timer menu above the bar.
  await b.bar.getByRole("button", { name: "Timer" }).click()
  await b.page.getByRole("menuitem", { name: "5 min", exact: true }).click()
  await expect.poll(() => b.timer()?.durationMs).toBe(5 * 60_000)

  // A round of three votes each, from the Vote menu: its heading says what the numbers are.
  await b.bar.getByRole("button", { name: "Vote", exact: true }).click()
  await expect(b.page.getByRole("menu")).toContainText("Votes for each person")
  await b.page.getByRole("menuitem", { name: "3 votes", exact: true }).click()
  await expect(b.bar.getByText("Voting · 3 left")).toBeVisible()
  for (const name of ["End voting", "Pause", "+1 min", "Stop the timer", "Present"]) await expect(b.bar.getByRole("button", { name, exact: true })).toBeVisible()
  await whole(b.page, 1280)

  // A vote on the venue note, then End voting: the results lead with it, and open above the bar.
  await b.page.getByRole("button", { name: "Vote for Book the venue" }).click()
  await b.bar.getByRole("button", { name: "End voting" }).click()
  const results = b.bar.getByRole("button", { name: "Results: “Book the venue” leads" })
  await expect(results).toBeVisible()
  await results.click()
  const list = b.page.getByRole("dialog")
  await expect(list.getByRole("button", { name: /Book the venue/ })).toBeVisible()
  await b.page.keyboard.press("Escape")
  await expect(list).toHaveCount(0)

  // Lee's timer runs out on another screen: the bar says so, and its icon, named for it, dismisses it.
  b.lee("timer", { endsAt: Date.now() - 1_000, durationMs: 5 * 60_000, byName: "Lee" })
  await expect(b.bar.getByRole("timer")).toHaveText("Time's up")
  await whole(b.page, 1280)
  await b.bar.getByRole("button", { name: "Dismiss the timer", exact: true }).click()
  await expect.poll(() => b.timer() ?? null).toBeNull()
  await b.context.close()
})

/**
 * `context` holds any code that is Results' own (a chunk that says "Nobody voted." and isn't the bar's), as a
 * slow connection would, until `release()`. The bar's code, and everything else, comes as it would. Results'
 * list comes with the bar's own code, so there is none to hold; the hold keeps the leg honest if that changes.
 */
async function holdResultsCode(context: BrowserContext) {
  let release = () => {}
  const released = new Promise<void>((done) => (release = done))
  await routeChunks(context, async (body): Promise<ChunkAnswer> => {
    if (body.includes("Nobody voted.") && !body.includes(BAR_CODE)) await released
    return "through"
  })
  return { release: () => release() }
}

// Results opens whole: its sheet (390) or its popover (1280) has the list's room from its first frame, so
// nothing moves when the list is in, whatever the count (design review, 29 Oct: while the list's code came,
// the room was three rows for every count, so the sheet and the popover jumped as it landed). A slow
// connection holds any code of Results' own until the room has been read.
for (const device of ["phone", "computer"] as const) {
  const width = DEVICES[device].viewport.width
  test(`Results opens whole at ${width}: nothing moves as its list comes in, for 0, 1 and 3 results`, async ({ browser }) => {
    test.setTimeout(180_000)
    for (const n of [0, 1, 3]) {
      const on = shareBoard({ vic: "view", ann: "edit" }, true)
      let held = { release: () => {} }
      const s = await open(browser, device, { on, user: device === "phone" ? USERS.vic : USERS.ann, route: async (c) => void (held = await holdResultsCode(c)) })
      try {
        // Lee runs a round from a third screen: n notes get a vote, then the round closes.
        const round = `r-${n}`
        s.lee("voting", { id: round, perPerson: 3, byId: "lee", byName: "Lee" })
        // A viewer reads "Lee started voting", an editor "Voting · 3 left".
        await expect(s.bar).toContainText(/voting/i)
        on.collab.edit(NAME, (doc: { getMap: (name: string) => { set: (k: string, v: unknown) => void } }) =>
          doc.getMap("votes").set(`${round}:lee`, ["venue", "recap", "menu"].slice(0, n)),
        )
        s.lee("voting", { id: round, perPerson: 3, byId: "lee", byName: "Lee", closedAt: Date.now() })
        // With a leader, Results' name says who leads.
        const results = s.bar.getByRole("button", { name: /^Results/ })
        await expect(results).toBeVisible()
        if (device === "phone") await results.tap()
        else await results.click()
        const room = device === "phone" ? s.page.getByRole("dialog").filter({ hasText: "Results" }) : s.page.getByRole("dialog")
        await expect(room).toBeVisible()
        await settled(room)
        const first = await boxOf(room)
        held.release()
        if (n === 0) await expect(room).toContainText("Nobody voted.")
        else await expect(room.getByRole("listitem")).toHaveCount(n)
        await settled(room)
        const after = await boxOf(room)
        console.log(`results ${width} n=${n}: first ${JSON.stringify(first)} after ${JSON.stringify(after)}`)
        expect(Math.abs(after.y - first.y), `${n} results at ${width}: the room's top moved, ${first.y} -> ${after.y}`).toBeLessThanOrEqual(2)
        expect(Math.abs(after.height - first.height), `${n} results at ${width}: the room's height moved, ${first.height} -> ${after.height}`).toBeLessThanOrEqual(2)
      } finally {
        held.release()
        // A chunk can still be on its way through the route as the screen closes.
        await s.context.unrouteAll({ behavior: "ignoreErrors" })
        await s.context.close()
      }
    }
  })
}

// The bar is a chunk of its own (page.tsx: lazyPart), so the board's first screen never waits on it. Its
// chunk is the one with these words: boardFacilitation.tsx alone has them.
const BAR_CODE = "Votes for each person"

/** `context` holds the bar's code until release(), as a slow connection would; `asked` counts its requests. Other code comes at once. */
async function holdBarCode(context: BrowserContext) {
  const held = { asked: 0, release: () => {} }
  const gate = new Promise<void>((resolve) => {
    held.release = () => resolve()
  })
  await routeChunks(context, async (body): Promise<ChunkAnswer> => {
    if (body.includes(BAR_CODE)) {
      held.asked += 1
      await gate
    }
    return "through"
  })
  return held
}

/** `context` refuses the bar's code, as a dropped connection would, until it unroutes CHUNKS; `refused` counts the refusals. */
async function refuseBarCode(context: BrowserContext) {
  const held = { refused: 0 }
  await routeChunks(context, (body) => {
    if (!body.includes(BAR_CODE)) return "through"
    held.refused += 1
    return "refuse"
  })
  return held
}

/** Where the board's chrome (all but the bar) and the canvas sit, to the pixel: nothing else may move when the bar lands. */
async function chromeBoxes(page: Page) {
  return page.locator("[data-board-chrome]:not([data-facilitation]), .excalidraw").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      const name = el.getAttribute("aria-label") ?? String(el.className).split(" ")[0]
      return `${name} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`
    }),
  )
}

/**
 * The board works: a click (a tap on a phone) on the venue note selects it, and the notes bar is its own. The note
 * stays selected, and the notes bar's entrance is over (settled) before anything is measured.
 */
async function selectsANote(page: Page, device: keyof typeof DEVICES) {
  const canvas = await boxOf(page.locator(".excalidraw").first())
  if (device === "phone") await page.touchscreen.tap(canvas.x + 130, canvas.y + 210)
  else await page.mouse.click(canvas.x + 130, canvas.y + 210)
  const notes = page.locator("[data-notes-bar]").getByRole("toolbar", { name: "Note" })
  await expect(notes, "the board works while the bar isn't there").toBeVisible()
  await settled(notes)
}

/** `el` is inside the screen and clear of the board's other chrome and Excalidraw's footer: each box it overlaps by over half a pixel is listed. */
async function inScreenAndApart(el: Locator, size: { width: number; height: number }) {
  const box = await boxOf(el)
  expect(box.x, "inside the screen").toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(size.width)
  expect(box.y + box.height).toBeLessThanOrEqual(size.height)
  const clashes = await el.evaluate((me) => {
    const mine = me.getBoundingClientRect()
    return [...document.querySelectorAll("[data-board-chrome], .App-bottom-bar > .Island")]
      .filter((o) => !o.contains(me) && !me.contains(o) && getComputedStyle(o).visibility !== "hidden")
      .map((o) => ({ name: o.getAttribute("aria-label") ?? String(o.className).slice(0, 40), r: o.getBoundingClientRect() }))
      .filter(({ r }) => Math.min(r.right, mine.right) - Math.max(r.left, mine.left) > 0.5 && Math.min(r.bottom, mine.bottom) - Math.max(r.top, mine.top) > 0.5)
      .map(({ name, r }) => `${name} ${Math.round(r.left)}-${Math.round(r.right)} x ${Math.round(r.top)}-${Math.round(r.bottom)}`)
  })
  expect(clashes, "clear of the board's other chrome and Excalidraw's footer").toEqual([])
}

/** The bar lands where the words that it couldn't come stood: one dock, so the same middle and the same foot. */
function oneDock(bar: Box, failed: Box) {
  expect(Math.abs(bar.x + bar.width / 2 - (failed.x + failed.width / 2)), "one dock: the same middle").toBeLessThanOrEqual(1)
  expect(Math.abs(bar.y + bar.height - (failed.y + failed.height)), "one dock: the same foot").toBeLessThanOrEqual(1)
}

// On a slow connection the board comes first: the bar's code is held until the canvas is up, the board works
// without it, and the bar lands whole and still, with nothing else moving (main, 29 Oct).
for (const device of ["computer", "phone"] as const) {
  const size = DEVICES[device].viewport
  test(`on a ${device}, while the bar's code is slow the board works, and the bar lands whole without moving anything`, async ({ browser }) => {
    test.setTimeout(120_000)
    let held = { asked: 0, release: () => {} }
    const sam = await open(browser, device, { route: async (context) => void (held = await holdBarCode(context)) })
    await expect.poll(() => held.asked, { message: "the bar's code was asked for" }).toBeGreaterThan(0)
    await expect(sam.bar).toHaveCount(0)
    await selectsANote(sam.page, device)
    const before = await chromeBoxes(sam.page)
    held.release()
    await expect(sam.bar).toBeVisible()
    await whole(sam.page, size.width)
    const landed = await boxOf(sam.bar)
    await sam.page.waitForTimeout(300)
    expect(await boxOf(sam.bar), "the bar lands still").toEqual(landed)
    expect(await chromeBoxes(sam.page), "nothing else moved when the bar landed").toEqual(before)
    await sam.context.close()
  })
}

// Offline, the bar's code can't come: its place says so in the words every part that can't come uses
// (PartRetry), the board carries on, and Try again brings the bar once the connection is back (main, 29 Oct).
for (const device of ["computer", "phone"] as const) {
  const size = DEVICES[device].viewport
  test(`on a ${device}, when the bar's code can't come its place says so, the board works, and Try again brings the bar`, async ({ browser }) => {
    test.setTimeout(120_000)
    let held = { refused: 0 }
    const sam = await open(browser, device, { route: async (context) => void (held = await refuseBarCode(context)) })
    const failed = sam.page.getByRole("alert").filter({ hasText: "Couldn't load Timer, Vote and Present." })
    await expect(failed).toBeVisible()
    expect(held.refused, "the bar's code was asked for, and refused").toBeGreaterThan(0)
    await inScreenAndApart(failed, size)
    const there = await boxOf(failed)
    await selectsANote(sam.page, device)
    // The connection is back: Try again brings the bar, in the same place.
    await sam.context.unroute(CHUNKS)
    const again = failed.getByRole("button", { name: "Couldn't load Timer, Vote and Present. Try again" })
    await (device === "phone" ? again.tap() : again.click())
    await expect(sam.bar).toBeVisible()
    await expect(failed).toHaveCount(0)
    await whole(sam.page, size.width)
    oneDock(await boxOf(sam.bar), there)
    await sam.context.close()
  })
}

// A viewer's bar only shows what's on. Main's rule: while nothing is on, a bar that can't come says nothing;
// once a round, a timer or presenting is on, the same place says what's missing, in the viewer's words
// (main and design review, 29 Oct).
test("on a phone, a viewer whose bar can't come sees nothing until a round starts, then its place says what's missing, all of it", async ({ browser }) => {
  test.setTimeout(150_000)
  let held = { refused: 0 }
  const on = shareBoard({ vic: "view", ann: "edit" })
  const vic = await open(browser, "phone", { on, user: USERS.vic, route: async (context) => void (held = await refuseBarCode(context)) })
  await expect.poll(() => held.refused, { message: "the bar's code was asked for, and refused" }).toBeGreaterThan(0)
  await vic.page.waitForTimeout(500)
  await expect(vic.page.getByText("Couldn't load", { exact: false }), "nothing is on, so nothing is missing").toHaveCount(0)

  // Lee starts a round from another screen.
  vic.lee("voting", { id: ROUND, perPerson: 3, byId: "lee", byName: "Lee" })
  const failed = vic.page.getByRole("alert").filter({ hasText: "Couldn't load the vote." })
  await expect(failed).toBeVisible()
  await inScreenAndApart(failed, DEVICES.phone.viewport)

  // Everything on at once, its longest words: Lee's timer runs too, and Ann presents from her computer.
  // The pill may take two lines; it stays one calm pill, inside the screen and clear of the rest.
  vic.lee("timer", { endsAt: Date.now() + 5 * 60_000, durationMs: 5 * 60_000, byName: "Lee" })
  const ann = await open(browser, "computer", { on, user: USERS.ann })
  await ann.bar.getByRole("button", { name: "Present", exact: true }).click()
  const all = vic.page.getByRole("alert").filter({ hasText: "Couldn't load who's presenting, the vote and the timer." })
  await expect(all).toBeVisible()
  await inScreenAndApart(all, DEVICES.phone.viewport)
  await expect(all.getByRole("button")).toHaveCount(1)
  const there = await boxOf(all)

  // The connection is back: Try again brings the bar, which says who started the round, where the pill stood.
  await vic.context.unroute(CHUNKS)
  await all.getByRole("button", { name: "Couldn't load who's presenting, the vote and the timer. Try again" }).tap()
  await expect(vic.bar).toContainText("Lee started voting")
  oneDock(await boxOf(vic.bar), there)
  await ann.context.close()
  await vic.context.close()
})
