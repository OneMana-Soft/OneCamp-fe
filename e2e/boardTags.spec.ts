import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame as frameAround, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"
import { finger, pinch } from "./finger"
import { boxOf } from "./boxes"
import { drawnOver } from "./layers"
import { settled } from "./sheetLayout"
import { untilStill } from "./stubbedApp"

// Tags with colours, to cluster by (miro-07 5): a tagged note shows its tags
// on the board in each tag's colour, as many as fit whole and a count of the
// rest; a tag's colour is changed from the notes bar for everyone on the
// board; and a selection clusters into a frame for each tag, named for it,
// which every screen on the board sees.

const BOARD = "b0a4d000-0000-4000-8000-0000000000a7"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type: string; name?: string | null; frameId?: string | null; isDeleted?: boolean }

const tagged = (els: Record<string, unknown>[], tags: string[]) => {
  els[0].customData = { kind: "note", colour: "yellow", tags }
  return els
}

/** The retro most tests use: two tagged notes, and two small ones with no tag. */
const retro = () => [
  ...tagged(note("venue", 40, 120, "Book the venue"), ["Risk"]),
  ...tagged(note("recap", 240, 120, "Send the recap"), ["risk", "ux"]),
  // Two small notes with no tag, side by side, whole on a phone above the board's bottom bars.
  ...note("prompt", 40, 320, "Who does what?", { size: 120 }),
  ...note("agenda", 180, 320, "Share the agenda", { size: 120 }),
]

/** A board of `notes` on one collaboration server, for everyone who opens it. */
function shareBoard(notes = retro(), levels: Record<string, string> = LEVELS) {
  const board = { uuid: BOARD, title: "Sprint retro", levels, update: boardDoc(ordered(notes)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

/** `user` opens the board on `device`, its camera at the board's origin at `zoom`. */
async function open(browser: Browser, device: keyof typeof DEVICES, o: { on?: ReturnType<typeof shareBoard>; user?: typeof USERS.sam; zoom?: number } = {}) {
  const { board, collab } = o.on ?? shareBoard()
  const user = o.user ?? USERS.sam
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(
    ({ key, zoom }: { key: string; zoom: number }) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        // The camera at the board's origin, so the notes are where they were drawn.
        localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom }))
      } catch {
        /* the notes are then elsewhere, and the test says so */
      }
    },
    { key: `onecamp:board:viewport:${BOARD}`, zoom: o.zoom ?? 1 },
  )
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: [...boardFixtures([board], user, USERS.sam)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const shared = () => [...collab.doc(NAME).getMap("elements").values()] as Shared[]
  const meta = (key: string) => collab.doc(NAME).getMap("boardMeta").get(key)
  return { context, page, shared, meta }
}

/**
 * A note's chips as they're drawn: the tags shown, the count of the rest, and whether every chip sits inside the
 * note and which are cut short. The overlay is hidden from screen readers (the notes bar reads tags out), so it's
 * read by its data attributes.
 */
async function chipsOn(page: Page, id: string) {
  return page.locator(`[data-note-tags-of="${id}"]`).evaluate((box) => {
    const edge = box.getBoundingClientRect()
    const chips = [...box.querySelectorAll<HTMLElement>("[data-chip]")]
    const inside = chips.every((c) => {
      const r = c.getBoundingClientRect()
      return r.left >= edge.left - 0.5 && r.right <= edge.right + 0.5 && r.bottom <= edge.bottom + 0.5
    })
    const words = (c: HTMLElement) => c.querySelector<HTMLElement>(":scope > span:not([data-chip-dot])")!
    const count = box.querySelector<HTMLElement>("[data-tag-rest]")
    return {
      shown: [...box.querySelectorAll("[data-tag]")].map((t) => t.getAttribute("data-tag")),
      count: count?.textContent ?? null,
      rest: count?.getAttribute("data-tip") ?? null,
      inside,
      cutShort: chips.filter((c) => words(c).scrollWidth > words(c).clientWidth + 0.5).map((c) => c.textContent),
    }
  })
}

for (const device of ["computer", "phone"] as const) {
  test(`a tag shows on its notes in its colour, and its colour changes for everyone (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device)
    const press = device === "phone" ? "tap" : "click"
    // The chips at the notes' feet, one colour for "Risk" and "risk" alike.
    const venue = b.page.locator('[data-note-tags-of="venue"] [data-tag="Risk"]')
    await expect(venue).toBeVisible()
    await expect(b.page.locator('[data-note-tags-of="recap"] [data-tag]')).toHaveText(["risk", "ux"])
    const before = await venue.getAttribute("data-hue")
    expect(await b.page.locator('[data-note-tags-of="recap"] [data-tag="risk"]').getAttribute("data-hue")).toBe(before)
    await expect(b.page.locator('[data-note-tags-of="prompt"]')).toHaveCount(0)

    // Select the venue note (its middle), then colour its tag from Tags.
    const canvas = await b.page.locator(".excalidraw").first().boundingBox()
    if (!canvas) throw new Error("the canvas isn't on the page")
    if (device === "phone") await b.page.touchscreen.tap(canvas.x + 130, canvas.y + 150)
    else await b.page.mouse.click(canvas.x + 130, canvas.y + 150)
    const bar = b.page.locator("[data-notes-bar]")
    await bar.getByRole("button", { name: "Tags" })[press]()
    const colours = b.page.getByRole("radiogroup", { name: "Colour of Risk" })
    await expect(colours).toBeVisible()
    const next = before === "berry" ? "Moss" : "Berry"
    await colours.getByRole("radio", { name: next })[press]()
    // Kept with the board for everyone, and every chip of the tag takes it.
    await expect.poll(() => b.meta("tagHue:risk"), { timeout: 5_000 }).toBe(next.toLowerCase())
    await expect(venue).toHaveAttribute("data-hue", next.toLowerCase())
    await expect(b.page.locator('[data-note-tags-of="recap"] [data-tag="risk"]')).toHaveAttribute("data-hue", next.toLowerCase())
    await b.context.close()
  })
}

for (const device of ["computer", "phone"] as const) {
  test(`a selection clusters into a frame for each tag, named for it, and says when there's no tag to go by (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device)
    const press = device === "phone" ? "tap" : "click"
    const at = async (x: number, y: number) => (device === "phone" ? b.page.touchscreen.tap(x, y) : b.page.mouse.click(x, y))
    const canvas = await b.page.locator(".excalidraw").first().boundingBox()
    if (!canvas) throw new Error("the canvas isn't on the page")
    const bar = b.page.locator("[data-notes-bar]")
    const byTag = b.page.getByRole("button", { name: /^By tag/ })

    // The two notes with no tag, as each screen selects two: a click and a Shift-click on a computer, a finger
    // drawing a box round them on a phone. By tag sends them to Tags first.
    if (device === "phone") {
      const f = await finger(b.page)
      await f.down(canvas.x + 25, canvas.y + 310)
      for (let i = 1; i <= 10; i++) {
        await f.move(canvas.x + 25 + 29 * i, canvas.y + 310 + 14.5 * i)
        await b.page.waitForTimeout(16)
      }
      // The finger rests at the box's corner before it lifts, as a person's does. Lifted mid-sweep, Chrome took it
      // as a fling, and the next tap only stopped the fling (it opened nothing).
      await b.page.waitForTimeout(150)
      await f.move(canvas.x + 315, canvas.y + 455)
      await f.up()
    } else {
      await at(canvas.x + 100, canvas.y + 380)
      await b.page.keyboard.down("Shift")
      await at(canvas.x + 240, canvas.y + 380)
      await b.page.keyboard.up("Shift")
    }
    await expect(bar.getByRole("toolbar", { name: "2 notes" })).toBeVisible()
    await bar.getByRole("button", { name: "Cluster into frames" })[press]()
    await settled(byTag)
    await untilStill(b.page)
    await expect(byTag).toContainText("None of these has a tag yet: tag them first")
    await byTag[press]()
    await expect(b.page.getByRole("textbox", { name: "Add a tag" })).toBeVisible()
    await b.page.keyboard.press("Escape")
    await expect(b.page.getByRole("textbox", { name: "Add a tag" })).toBeHidden()
    expect(b.shared().filter((e) => e.type === "frame" && !e.isDeleted)).toEqual([])

    // Every note on the board, as Ctrl+A selects them (from the empty ground above the notes).
    await at(canvas.x + 200, canvas.y + 100)
    await b.page.keyboard.press("ControlOrMeta+a")
    await expect(bar.getByRole("toolbar", { name: "4 notes" })).toBeVisible()
    await bar.getByRole("button", { name: "Cluster into frames" })[press]()
    await settled(byTag)
    await untilStill(b.page)
    await expect(byTag).toContainText("A frame for each tag: 2 frames")
    await byTag[press]()
    // The toast itself, not its screen-reader copy.
    await expect(b.page.locator(".toast-root", { hasText: "4 notes in 2 frames" })).toBeVisible()
    // On the shared board: two frames, named for the tag and for the rest, each holding its notes.
    await expect.poll(() => b.shared().filter((e) => e.type === "frame" && !e.isDeleted).map((f) => f.name).sort(), { timeout: 5_000 }).toEqual(["No tag", "Risk"])
    const frames = Object.fromEntries(b.shared().filter((e) => e.type === "frame").map((f) => [f.name, f.id]))
    const frameOf = (id: string) => b.shared().find((e) => e.id === id)?.frameId
    expect([frameOf("venue"), frameOf("recap"), frameOf("prompt"), frameOf("agenda")]).toEqual([frames.Risk, frames.Risk, frames["No tag"], frames["No tag"]])
    await b.context.close()
  })
}

for (const device of ["computer", "phone"] as const) {
  test(`a note shows the tags that fit whole and counts the rest, and a tag too long for its note is cut short (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const many = ["risk", "ux", "budget", "legal", "web"]
    const long = "Supplier contract before launch"
    // Side by side, whole on a phone: a note of the usual size with five tags, and a small one whose first tag is long.
    const b = await open(browser, device, {
      on: shareBoard([
        ...tagged(note("plan", 30, 120, "Launch plan"), many),
        ...tagged(note("supplier", 225, 120, "Call the supplier", { size: 140 }), [long, "risk"]),
      ]),
    })
    await expect(b.page.locator('[data-note-tags-of="plan"] [data-tag="risk"]')).toBeVisible()
    // As many as fit whole, in the note's order, at most three; the rest counted, and named in the app's label.
    const plan = await chipsOn(b.page, "plan")
    expect(plan.shown.length, JSON.stringify(plan)).toBeGreaterThanOrEqual(1)
    expect(plan).toEqual({
      shown: many.slice(0, Math.min(plan.shown.length, 3)),
      count: `+${many.length - plan.shown.length}`,
      rest: many.slice(plan.shown.length).join(", "),
      inside: true,
      cutShort: [],
    })
    // The long one is shown cut short (its whole name in the label), with the count after it, inside the small note.
    expect(await chipsOn(b.page, "supplier")).toEqual({ shown: [long], count: "+1", rest: "risk", inside: true, cutShort: [long] })
    if (device === "computer") {
      // A mouse resting on what a note can't show reads it in the app's label: the rest on the count, the whole name
      // on a tag cut short.
      const label = b.page.locator("[data-tip-layer]")
      await b.page.locator('[data-note-tags-of="plan"] [data-tag-rest]').hover()
      await expect(label).toHaveText(plan.rest!)
      await b.page.locator(`[data-note-tags-of="supplier"] [data-tag="${long}"]`).hover()
      await expect(label).toHaveText(long)
    } else {
      // A finger has no hover and passes through the chips to the note: a tap on the count selects it, and the notes
      // bar's Tags lists every one of its tags, those counted too.
      const count = await boxOf(b.page.locator('[data-note-tags-of="plan"] [data-tag-rest]'))
      await b.page.touchscreen.tap(count.x + count.width / 2, count.y + count.height / 2)
      const bar = b.page.locator("[data-notes-bar]")
      await expect(bar.getByRole("toolbar", { name: "Note" })).toBeVisible()
      await bar.getByRole("button", { name: "Tags" }).tap()
      const listed = b.page.getByRole("list", { name: "Tags on this board" })
      for (const t of many) await expect(listed.getByRole("button", { name: t, exact: true })).toHaveAttribute("aria-pressed", "true")
      // A finger's touch group keeps its rows 20px apart (app/phone.css F3b), and its first row as far under "Add a tag".
      const field = await boxOf(b.page.locator("form").filter({ has: b.page.getByRole("textbox", { name: "Add a tag" }) }))
      const items = await Promise.all((await listed.getByRole("listitem").all()).map(boxOf))
      const tops = [...new Set(items.map((c) => Math.round(c.y)))].sort((x, y) => x - y)
      const first = items.find((c) => Math.round(c.y) === tops[0])!
      expect(Math.round(tops[0] - (field.y + field.height)), "under the field").toBe(20)
      if (tops.length > 1) expect(Math.round(tops[1] - (tops[0] + first.height)), "between rows").toBe(20)
    }
    await b.context.close()
  })
}

for (const device of ["computer", "phone"] as const) {
  test(`just above half size the chips still fit their notes, and farther out they step back (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device, { zoom: 0.55 })
    const overlay = b.page.locator("[data-note-tags]")
    await expect(b.page.locator('[data-note-tags-of="venue"] [data-tag="Risk"]')).toBeVisible()
    // A 180px note is 99px across here: whole chips only, each inside its note.
    expect(await chipsOn(b.page, "venue")).toMatchObject({ shown: ["Risk"], inside: true, cutShort: [] })
    expect(await chipsOn(b.page, "recap")).toMatchObject({ inside: true, cutShort: [] })
    // Out past half size, as each screen zooms: Zoom out on a computer, two fingers pinching on a phone.
    const canvas = await b.page.locator(".excalidraw").first().boundingBox()
    if (!canvas) throw new Error("the canvas isn't on the page")
    if (device === "phone") await pinch(b.page, canvas.x + 195, canvas.y + 420, 200, 100)
    else await b.page.getByRole("button", { name: "Zoom out" }).click()
    await expect(overlay).toHaveCount(0)
    // And back in: the chips return.
    if (device === "phone") await pinch(b.page, canvas.x + 195, canvas.y + 420, 100, 240)
    else await b.page.getByRole("button", { name: "Zoom in" }).click()
    await expect(overlay).toHaveCount(1)
    await b.context.close()
  })
}

for (const device of ["computer", "phone"] as const) {
  test(`a viewer sees a tag's colour change as an editor picks it, and is offered no colours (${device})`, async ({ browser }) => {
    test.setTimeout(150_000)
    const on = shareBoard(retro(), { sam: "edit", vic: "view" })
    const sam = await open(browser, "computer", { on })
    const vic = await open(browser, device, { on, user: USERS.vic })
    const chip = (p: Page, id: string, tag: string) => p.locator(`[data-note-tags-of="${id}"] [data-tag="${tag}"]`)
    await expect(chip(vic.page, "venue", "Risk")).toBeVisible()
    const before = await chip(vic.page, "venue", "Risk").getAttribute("data-hue")
    // The viewer taps the note as an editor would to tag it.
    const seen = await vic.page.locator(".excalidraw").first().boundingBox()
    if (!seen) throw new Error("the viewer's canvas isn't on the page")
    if (device === "phone") await vic.page.touchscreen.tap(seen.x + 130, seen.y + 150)
    else await vic.page.mouse.click(seen.x + 130, seen.y + 150)
    // The editor colours Risk from the notes bar...
    const edits = await sam.page.locator(".excalidraw").first().boundingBox()
    if (!edits) throw new Error("the editor's canvas isn't on the page")
    await sam.page.mouse.click(edits.x + 130, edits.y + 150)
    await sam.page.locator("[data-notes-bar]").getByRole("button", { name: "Tags" }).click()
    const next = before === "berry" ? "Moss" : "Berry"
    await sam.page.getByRole("radiogroup", { name: "Colour of Risk" }).getByRole("radio", { name: next }).click()
    // ...and the viewer's chips take it as it's picked, every chip of the tag.
    await expect(chip(vic.page, "venue", "Risk")).toHaveAttribute("data-hue", next.toLowerCase())
    await expect(chip(vic.page, "recap", "risk")).toHaveAttribute("data-hue", next.toLowerCase())
    // The viewer's tap opened no notes bar: tags and their colours are an editor's.
    await expect(vic.page.locator("[data-notes-bar]")).toHaveCount(0)
    await expect(vic.page.getByRole("radiogroup", { name: "Colour of Risk" })).toHaveCount(0)
    await sam.context.close()
    await vic.context.close()
  })
}

test("a note's chips sit under Excalidraw's tool bar, its style panel and its menu (computer)", async ({ browser }) => {
  test.setTimeout(120_000)
  // A tagged note where the style panel opens, one to bring under the tool bar, and a filled shape to select.
  const b = await open(browser, "computer", {
    on: shareBoard([
      ...tagged(note("left", 20, 260, "Under the panel"), ["risk", "ux"]),
      ...tagged(note("low", 560, 420, "Under the tools"), ["risk"]),
      shape("box", "rectangle", 900, 200, 160, 100, { fill: "#ffc9c9" }),
    ]),
  })
  const canvas = await boxOf(b.page.locator(".excalidraw").first())
  const chip = (id: string) => b.page.locator(`[data-note-tags-of="${id}"] [data-tag="risk"]`)
  // The style panel, open for a selected shape, over the chips of a note beside it.
  await b.page.mouse.click(canvas.x + 980, canvas.y + 250)
  await expect.poll(() => drawnOver(b.page.locator(".App-menu__left").first(), chip("left"))).toBe(true)
  // The right-click menu, opened on the ground just beside the note (the shape let go by a click on the ground), over its chips.
  await b.page.mouse.click(canvas.x + 700, canvas.y + 100)
  await b.page.mouse.click(canvas.x + 8, canvas.y + 300, { button: "right" })
  await expect.poll(() => drawnOver(b.page.locator(".context-menu").first(), chip("left"))).toBe(true)
  await b.page.keyboard.press("Escape")
  await expect(b.page.locator(".context-menu")).toHaveCount(0)
  // The tool bar: the board scrolled until a note's chips are under it.
  const tools = b.page.locator(".App-toolbar").first()
  const t = await boxOf(tools)
  const c = await boxOf(chip("low"))
  await b.page.mouse.move(canvas.x + 700, canvas.y + 330)
  await b.page.mouse.wheel(c.x + c.width / 2 - (t.x + t.width / 2), c.y + c.height / 2 - (t.y + t.height / 2))
  await expect.poll(() => drawnOver(tools, chip("low"))).toBe(true)
  await b.context.close()
})

test("the notes bar is on keys: Alt+G tidies the selection into an even grid for everyone, Alt+2 recolours it (computer)", async ({ browser }) => {
  test.setTimeout(120_000)
  // Three notes strewn about, as a brainstorm leaves them.
  const b = await open(browser, "computer", {
    on: shareBoard([...note("one", 40, 120, "One"), ...note("two", 330, 190, "Two"), ...note("three", 120, 430, "Three")]),
  })
  const canvas = await boxOf(b.page.locator(".excalidraw").first())
  // Every note, as Ctrl+A selects them (from the empty ground beside them).
  await b.page.mouse.click(canvas.x + 700, canvas.y + 100)
  await b.page.keyboard.press("ControlOrMeta+a")
  const bar = b.page.locator("[data-notes-bar]")
  await expect(bar.getByRole("toolbar", { name: "3 notes" })).toBeVisible()
  await expect(bar.getByRole("button", { name: "Tidy up into a grid" })).toHaveAttribute("aria-keyshortcuts", "Alt+G")
  await b.page.keyboard.press("Alt+g")
  // On the shared board: two columns and two rows at most, every note clear of the others.
  const placed = async () => {
    const notes = b.shared().filter((e) => ["one", "two", "three"].includes(e.id)) as (Shared & { x: number; y: number; width: number; height: number })[]
    return { columns: new Set(notes.map((n) => Math.round(n.x))).size, rows: new Set(notes.map((n) => Math.round(n.y))).size }
  }
  await expect.poll(placed, { timeout: 5_000 }).toEqual({ columns: 2, rows: 2 })
  // Alt+2, the second camp colour: green, for everyone.
  // Alt+T stays the app's key to its notifications (components/ui/toast), notes selected or not.
  await b.page.keyboard.press("Alt+t")
  await expect(b.page.locator(".toast-viewport")).toBeFocused()
  await expect(bar.getByRole("toolbar", { name: "3 notes" })).toBeVisible()
  await b.page.keyboard.press("Alt+2")
  await expect.poll(() => b.shared().filter((e) => e.id === "two").map((e) => (e as Shared & { backgroundColor?: string }).backgroundColor), { timeout: 5_000 }).toEqual(["#E6F6EC"])
  await b.context.close()
})

// Filter by tag (miro-07 5), from the board's menu: the notes without the tags picked fade back behind a veil, on the
// picker's screen only, until the filter is cleared; Select these selects the notes kept.
for (const device of ["computer", "phone"] as const) {
  test(`a filter by tag fades the notes without it, on this screen only, stays while the board is worked, and selects the rest (${device})`, async ({ browser }) => {
    test.setTimeout(150_000)
    const on = shareBoard(retro(), { sam: "edit", ann: "view" })
    const b = await open(browser, device, { on })
    const ann = await open(browser, "computer", { on, user: USERS.ann })
    const press = device === "phone" ? "tap" : "click"
    const before = JSON.stringify(b.shared())
    // From the board's menu, beside Find on board.
    if (device === "phone") await b.page.getByRole("button", { name: "Board options" }).tap()
    else await b.page.getByRole("button", { name: "More", exact: true }).click()
    await b.page.getByRole("menuitem", { name: "Filter by tag" })[press]()
    const panel = b.page.locator("[data-tag-filter]")
    const chips = panel.getByRole("list", { name: "Filter by these tags" })
    await chips.getByRole("button", { name: "Risk", exact: true })[press]()
    // "Risk" and "risk" are one tag: both tagged notes stay, the two without a tag fade.
    const veil = b.page.locator("[data-tag-veil]")
    await expect(veil).toHaveAttribute("data-tag-veil", "2")
    await expect(panel.getByRole("status")).toHaveText("2 notes")
    // This screen's only: Ann's board has no veil, and nothing in the drawing changed.
    await expect(ann.page.locator("[data-tag-veil]")).toHaveCount(0)
    expect(JSON.stringify(b.shared())).toBe(before)
    // Another tag adds its notes; taking the first off leaves the second's: the venue note fades, its chips too.
    await chips.getByRole("button", { name: "ux", exact: true })[press]()
    await chips.getByRole("button", { name: "Risk", exact: true })[press]()
    await expect(veil).toHaveAttribute("data-tag-veil", "1")
    await expect(b.page.locator('[data-note-tags-of="venue"]')).toHaveAttribute("data-faded", "true")
    expect(await b.page.locator('[data-note-tags-of="recap"]').getAttribute("data-faded")).toBeNull()
    // Select these: the note kept is selected, and the notes bar is its own.
    await panel.getByRole("button", { name: "Select these" })[press]()
    await expect(b.page.locator("[data-notes-bar]").getByRole("toolbar", { name: "Note" })).toBeVisible()
    if (device === "computer") await panel.getByRole("button", { name: "Close Filter by tag" }).click()
    // Closed, the filter stays while the board is worked on, and says so where the panel was.
    const pill = b.page.locator("[data-tag-filter-pill]")
    await expect(pill.getByRole("button", { name: "Filtered by ux: 1 note. Change the filter" })).toBeVisible()
    if (device === "phone") {
      // At 390 the pill covers no control: the tool column runs down the right under the tool row (design review M1).
      const at = await boxOf(pill)
      const covered = await b.page.evaluate((p) => {
        const out: string[] = []
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], [role='radio']"))) {
          if (el.closest("[data-tag-filter-pill]")) continue
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0 && r.left < p.x + p.width && r.right > p.x && r.top < p.y + p.height && r.bottom > p.y) out.push((el.getAttribute("aria-label") || el.title || el.textContent || "").trim().slice(0, 40))
        }
        return out
      }, at)
      expect(covered, "controls under the pill").toEqual([])
    }
    const canvas = await boxOf(b.page.locator(".excalidraw").first())
    // On a phone, the empty ground 60 px above the kept note (its chips sit along its foot, a 180 px note above them):
    // lower down, a tap at the canvas's foot lands on the facilitation bar's Vote.
    const keptChips = await boxOf(b.page.locator('[data-note-tags-of="recap"]'))
    if (device === "phone") await b.page.touchscreen.tap(keptChips.x + keptChips.width / 2, keptChips.y + keptChips.height - 200 - 60)
    else await b.page.mouse.click(canvas.x + 700, canvas.y + 100)
    await expect(b.page.locator("[data-notes-bar]")).toHaveCount(0)
    await expect(veil).toHaveAttribute("data-tag-veil", "1")
    await pill.getByRole("button", { name: "Clear the filter" })[press]()
    await expect(veil).toHaveCount(0)
    await expect(pill).toHaveCount(0)
    await ann.context.close()
    await b.context.close()
  })
}

// Filter by tag sits in the board's menu (More on a computer, Board options on a phone); on a board with no tags yet,
// its panel says where tags come from.
for (const device of ["computer", "phone"] as const) {
  test(`with no tags yet, Filter by tag says to tag notes from the notes bar (${device})`, async ({ browser }) => {
    test.setTimeout(90_000)
    const b = await open(browser, device, { on: shareBoard([...note("plain", 40, 120, "No tags here")]) })
    const press = device === "phone" ? "tap" : "click"
    if (device === "phone") await b.page.getByRole("button", { name: "Board options" }).tap()
    else await b.page.getByRole("button", { name: "More", exact: true }).click()
    await expect(b.page.getByRole("menuitem", { name: "Filter by tag" })).toBeVisible()
    await b.page.getByRole("menuitem", { name: "Filter by tag" })[press]()
    const panel = b.page.locator("[data-tag-filter]")
    await expect(panel.getByText("No tags on this board yet. Tag notes from the notes bar.")).toBeVisible()
    // Nothing to pick, so nothing to do: no footer.
    await expect(panel.locator("[data-tag-filter-foot]")).toHaveCount(0)
    await b.context.close()
  })
}

// With tags enough to scroll the panel, its actions stay pinned in view: Select these whole on the screen, in the
// computer panel's footer or the phone sheet's, never at the end of the list (design review M2: the owner's rule
// that an overlay's actions sit in a pinned footer).
for (const device of ["computer", "phone"] as const) {
  test(`with tags enough to scroll, the filter's actions stay pinned in view (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    // A note keeps at most MAX_TAGS (lib/board/sticky) tags: 80 tags take ten notes of eight.
    const PER_NOTE = 8
    const topics = (n: number) => Array.from({ length: PER_NOTE }, (_, i) => `topic ${String(n * PER_NOTE + i + 1).padStart(2, "0")}`)
    const many = Array.from({ length: 80 / PER_NOTE }, (_, n) => tagged(note(`many${n}`, 40 + (n % 4) * 220, 120 + Math.floor(n / 4) * 260, `Note ${n + 1}`), topics(n))).flat()
    const b = await open(browser, device, { on: shareBoard(many) })
    const press = device === "phone" ? "tap" : "click"
    if (device === "phone") await b.page.getByRole("button", { name: "Board options" }).tap()
    else await b.page.getByRole("button", { name: "More", exact: true }).click()
    await b.page.getByRole("menuitem", { name: "Filter by tag" })[press]()
    const panel = b.page.locator("[data-tag-filter]")
    const chips = panel.getByRole("list", { name: "Filter by these tags" })
    await expect(chips.getByRole("listitem")).toHaveCount(80)
    // More than the panel holds: its list scrolls.
    const scrolls = await chips.evaluate((ul) => {
      let el = ul.parentElement
      while (el && getComputedStyle(el).overflowY !== "auto") el = el.parentElement
      return !!el && el.scrollHeight > el.clientHeight
    })
    expect(scrolls, "the tag list scrolls").toBe(true)
    await chips.getByRole("button", { name: "topic 01", exact: true })[press]()
    const select = panel.getByRole("button", { name: "Select these" })
    await expect(select).toBeInViewport({ ratio: 1 })
    const footer = panel.locator(device === "phone" ? "[data-sheet-footer]" : "[data-board-panel-footer]")
    await expect(footer.getByRole("button", { name: "Select these" })).toBeVisible()
    await expect(footer.getByRole("status")).toHaveText("1 note")
    // Scrolled to its last tag, the list leaves the actions where they were.
    const before = await boxOf(select)
    await chips.getByRole("listitem").last().scrollIntoViewIfNeeded()
    await expect(chips.getByRole("listitem").last()).toBeInViewport()
    expect(await boxOf(select)).toEqual(before)
    await b.context.close()
  })
}

/**
 * One animation frame of the page. Excalidraw draws a drag once per frame (its handler is rAF-throttled), so a test
 * paces a drag by frames, never by the clock: under load a clock-paced drag folds into fewer drawn frames.
 */
const frame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))

/**
 * Watches a note as Excalidraw holds it (its own App, found through React's fiber under the canvas), from inside the
 * page: on every frame Excalidraw draws (its onChange, after the board's own listeners have run) how far the note's
 * chips sit from the note's corner, and on every animation frame how the bar beside the selection and the chips are
 * drawn. A rAF alone can land between Excalidraw moving the note in place and its drawing that move, so the chips are
 * held to the note on each drawn frame. Returns how to stop it and read what it saw.
 */
async function watchNote(page: Page, id: string) {
  await page.evaluate((id) => {
    type El = { x: number; y: number; width: number; height: number }
    type App = { scene: { getNonDeletedElementsMap(): Map<string, El> }; state: { scrollX: number; scrollY: number; zoom: { value: number } }; onChangeEmitter: { on(cb: () => void): () => void } }
    const host = document.querySelector(".excalidraw") as HTMLElement
    const key = Object.keys(host).find((k) => k.startsWith("__reactFiber$"))!
    let fiber = (host as unknown as Record<string, { return: unknown; stateNode: unknown } | null>)[key]
    while (fiber && !(fiber.stateNode as App | null)?.onChangeEmitter) fiber = fiber.return as typeof fiber
    const app = fiber!.stateNode as App
    const drawn: number[] = []
    const frames: { bar: string; chips: string }[] = []
    const off = () => {
      const el = app.scene.getNonDeletedElementsMap().get(id)
      const chips = document.querySelector(`[data-note-tags-of="${id}"]`)
      if (!el || !chips) return -1
      const s = app.state
      const box = chips.getBoundingClientRect()
      const c = host.getBoundingClientRect()
      return Math.max(Math.abs(box.left - c.left - (el.x + s.scrollX) * s.zoom.value), Math.abs(box.top - c.top - (el.y + s.scrollY) * s.zoom.value))
    }
    const stopDrawn = app.onChangeEmitter.on(() => queueMicrotask(() => drawn.push(off())))
    let live = true
    const tick = () => {
      if (!live) return
      const bar = document.querySelector("[data-notes-bar]")
      const chips = document.querySelector(`[data-note-tags-of="${id}"]`)
      const b = bar ? getComputedStyle(bar) : null
      frames.push({ bar: b ? `${b.visibility} ${b.opacity}` : "none", chips: chips ? getComputedStyle(chips).opacity : "none" })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    ;(window as unknown as { __watch: unknown }).__watch = {
      app,
      drawn,
      frames,
      stop: () => {
        live = false
        stopDrawn()
      },
    }
  }, id)
  /** The note's box on the page as Excalidraw holds it now. */
  const noteBox = () =>
    page.evaluate((id) => {
      type El = { x: number; y: number; width: number; height: number }
      const w = (window as unknown as { __watch: { app: { scene: { getNonDeletedElementsMap(): Map<string, El> }; state: { scrollX: number; scrollY: number; zoom: { value: number } } } } }).__watch
      const el = w.app.scene.getNonDeletedElementsMap().get(id)!
      const s = w.app.state
      const c = document.querySelector(".excalidraw")!.getBoundingClientRect()
      const z = s.zoom.value
      return { x: c.left + (el.x + s.scrollX) * z, y: c.top + (el.y + s.scrollY) * z, width: el.width * z, height: el.height * z }
    }, id)
  const seen = () =>
    page.evaluate(() => {
      const w = (window as unknown as { __watch: { drawn: number[]; frames: { bar: string; chips: string }[]; stop: () => void } }).__watch
      w.stop()
      return { drawn: [...w.drawn], frames: [...w.frames] }
    })
  return { noteBox, seen }
}

// Excalidraw moves a note IN PLACE, frame by frame (miro-06, DB-43). The note's chips are its face: they ride with it
// on every drawn frame at full ink. Its bar steps aside from the first movement past the drag threshold (a click
// never blinks it), and at the drop comes back straight above the note's new place, its foot 8 px clear of the turn
// handle (18 to 26 px above the note), fading in. An arrow key's nudge re-places it at once, without hiding it.
test("on a computer, a dragged note's chips ride with it, and its bar steps aside and comes back above it at the drop", async ({ browser }) => {
  const b = await open(browser, "computer", { on: shareBoard([...tagged(note("venue", 300, 300, "Book the venue"), ["Risk", "ux"]), ...note("agenda", 40, 120, "Share the agenda")]) })
  const { page } = b
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  const bar = page.locator("[data-notes-bar]")
  const toolbar = bar.getByRole("toolbar", { name: "Note" })
  const from = { x: canvas.x + 390, y: canvas.y + 390 }
  await page.mouse.click(from.x, from.y)
  await expect(toolbar).toBeVisible()
  const w = await watchNote(page, "venue")

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Less than the drag threshold: a click, and the bar stays.
  await page.mouse.move(from.x + 4, from.y + 3)
  await frame(page)
  await expect(bar).toHaveCSS("visibility", "visible")
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + 20 * i, from.y + 8 * i)
    await frame(page)
  }
  // Mid-drag: the bar is gone, with no pointer and no tab stop.
  await expect(bar).toHaveCSS("opacity", "0")
  await expect(bar).toHaveCSS("visibility", "hidden")
  await page.mouse.up()
  await expect(bar).toHaveCSS("opacity", "1")
  await expect(bar).toHaveCSS("visibility", "visible")

  // Straight above the note's new place, its foot 8 px clear of the turn handle.
  const dropped = await w.noteBox()
  // It went where it was dragged (about 400 px right; Excalidraw may snap it a little).
  expect(dropped.x - canvas.x).toBeGreaterThan(300 + 350)
  const at = (await toolbar.boundingBox())!
  expect(Math.abs(at.x + at.width / 2 - (dropped.x + dropped.width / 2))).toBeLessThanOrEqual(1)
  expect(dropped.y - (at.y + at.height)).toBeGreaterThanOrEqual(26 + 8 - 1)
  expect(dropped.y - (at.y + at.height)).toBeLessThanOrEqual(26 + 8 + 1)

  const { drawn, frames } = await w.seen()
  // The chips held to the note's corner on every frame Excalidraw drew, and were never hidden or dimmed.
  expect(drawn.length).toBeGreaterThan(10)
  expect(drawn.filter((d) => d < 0 || d > 1)).toEqual([])
  expect(frames.filter((f) => f.chips !== "1")).toEqual([])
  // The bar left once and came back once: hidden over one run of frames, never shown between.
  const hidden = frames.map((f) => f.bar.startsWith("hidden"))
  const first = hidden.indexOf(true)
  const last = hidden.lastIndexOf(true)
  expect(first).toBeGreaterThan(0)
  expect(hidden.slice(first, last + 1).every(Boolean)).toBe(true)

  // An arrow key's nudge (5 px with Shift) re-places the bar at once, each step, and never hides it.
  const w2 = await watchNote(page, "venue")
  const rest = (await toolbar.boundingBox())!
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press("Shift+ArrowDown")
    await expect.poll(async () => Math.round((await toolbar.boundingBox())!.y - rest.y)).toBe(5 * i)
  }
  const nudged = await w2.noteBox()
  expect(Math.abs(nudged.y - dropped.y - 15)).toBeLessThanOrEqual(0.5)
  const after = await w2.seen()
  expect(after.frames.filter((f) => !f.bar.startsWith("visible"))).toEqual([])
  expect(after.drawn.filter((d) => d < 0 || d > 1)).toEqual([])
  await b.context.close()
})

// A frame moves by its name almost always (DB-44). The press lands on Excalidraw's label for the name, not on its
// canvas, and Excalidraw moves the frame as it moves a note: its bar steps aside the same way, from the first
// movement past the drag threshold, and comes back above the frame's new place at the drop.
test("on a computer, a frame dragged by its name sends its bar aside, and the bar comes back above it at the drop", async ({ browser }) => {
  const inside = note("goal", 300, 300, "Ship the beta")
  const b = await open(browser, "computer", { on: shareBoard([...inside, frameAround("sprint", "Sprint", inside)]) })
  const { page } = b
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  const name = (await page.locator('[id$="-frame-name-sprint"]').boundingBox())!
  const from = { x: name.x + Math.min(16, name.width / 2), y: name.y + name.height / 2 }
  // A press on the name selects the frame, and its bar shows above it.
  await page.mouse.click(from.x, from.y)
  const bar = page.locator("[data-frame-bar]")
  const toolbar = bar.getByRole("toolbar", { name: "Frame" })
  await expect(toolbar).toBeVisible()
  const w = await watchNote(page, "sprint")
  const rest = await w.noteBox()

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // Less than the drag threshold: a click, and the bar stays.
  await page.mouse.move(from.x + 4, from.y + 3)
  await frame(page)
  await expect(bar).toHaveCSS("visibility", "visible")
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(from.x + 15 * i, from.y + 5 * i)
    await frame(page)
  }
  // Mid-drag: the bar is gone, with no pointer and no tab stop.
  await expect(bar).toHaveCSS("opacity", "0")
  await expect(bar).toHaveCSS("visibility", "hidden")
  await page.mouse.up()
  await expect(bar).toHaveCSS("opacity", "1")
  await expect(bar).toHaveCSS("visibility", "visible")

  // The frame went where it was dragged (about 300 px right), and its bar is straight above its new place.
  const dropped = await w.noteBox()
  expect(dropped.x - rest.x).toBeGreaterThan(250)
  const at = (await toolbar.boundingBox())!
  expect(Math.abs(at.x + at.width / 2 - (dropped.x + dropped.width / 2))).toBeLessThanOrEqual(1)
  expect(dropped.y - (at.y + at.height)).toBeGreaterThanOrEqual(26 + 8 - 1)
  expect(dropped.y - (at.y + at.height)).toBeLessThanOrEqual(26 + 8 + 1)
  expect(dropped.x - canvas.x).toBeGreaterThan(0)
  await w.seen()
  await b.context.close()
})

test("on a phone, a note dragged by a finger keeps its chips, and the selection's dock steps aside until the finger lifts", async ({ browser }) => {
  const b = await open(browser, "phone", { on: shareBoard([...tagged(note("venue", 60, 260, "Book the venue"), ["Risk", "ux"])]) })
  const { page } = b
  const dock = page.locator("[data-notes-bar]")
  const toolbar = dock.getByRole("toolbar", { name: "Note" })
  const w = await watchNote(page, "venue")
  const start = await w.noteBox()
  const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
  await page.touchscreen.tap(from.x, from.y)
  await expect(toolbar).toBeVisible()
  // The dock's place once its own entrance and fades have played out (mid-entrance it is still scaling in).
  const settled = async () => {
    await dock.evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
          .map((a) => a.finished),
      ),
    )
    return (await toolbar.boundingBox())!
  }
  const rest = await settled()
  // A finger as Chromium hands it to the page: touch events, and pointer events of type "touch".
  const cdp = await b.context.newCDPSession(page)
  const finger = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] : [] })

  await finger("touchStart", from)
  // Less than the drag threshold: a tap, and the dock stays.
  await finger("touchMove", { x: from.x + 4, y: from.y + 3 })
  await frame(page)
  await expect(dock).toHaveCSS("visibility", "visible")
  // Down the screen, through where the dock sits.
  for (let i = 1; i <= 16; i++) {
    await finger("touchMove", { x: from.x + 6 * i, y: from.y + 14 * i })
    await frame(page)
  }
  // Mid-drag: the dock is gone, with nothing to press and no tab stop, so the note is never under it.
  await expect(dock).toHaveCSS("opacity", "0")
  await expect(dock).toHaveCSS("visibility", "hidden")
  await finger("touchEnd")
  await expect(dock).toHaveCSS("opacity", "1")
  await expect(dock).toHaveCSS("visibility", "visible")

  // The note went where the finger took it, and the dock is back in its own place.
  const dropped = await w.noteBox()
  expect(dropped.y - start.y).toBeGreaterThan(180)
  expect(await settled()).toEqual(rest)

  const { drawn, frames } = await w.seen()
  // The chips held to the note's corner on every frame Excalidraw drew, and were never hidden or dimmed.
  expect(drawn.length).toBeGreaterThan(5)
  expect(drawn.filter((d) => d < 0 || d > 1)).toEqual([])
  expect(frames.filter((f) => f.chips !== "1")).toEqual([])
  // The dock left once and came back once.
  const hidden = frames.map((f) => f.bar.startsWith("hidden"))
  const first = hidden.indexOf(true)
  const last = hidden.lastIndexOf(true)
  expect(first).toBeGreaterThan(0)
  expect(hidden.slice(first, last + 1).every(Boolean)).toBe(true)
  await b.context.close()
})
