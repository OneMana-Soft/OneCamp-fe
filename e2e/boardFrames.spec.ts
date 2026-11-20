import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server. Nothing leaves the machine.
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { boardRoom } from "./boxes"

// Frames (miro-11): a frame starts at a size (16:9, A4, phone…) from the Frame tool beside the tools on a computer,
// and from the Frames panel's Add a frame on a phone (a sheet: a phone has no tool bar of ours); and a frame lays out
// its notes in a grid, in rows or in columns from its bar, growing to hold them, for everyone on the board.

const BOARD = "b0a4d000-0000-4000-8000-0000000000d9"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit" }

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  sideways: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type?: string; isDeleted?: boolean; x: number; y: number; width: number; height: number; name?: string | null; frameId?: string | null; customData?: Record<string, unknown> }

async function open(browser: Browser, device: keyof typeof DEVICES, elements: unknown[]) {
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(ordered(elements as never)) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript((key: string) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      // The camera at the board's origin, so a frame's name is where it was drawn.
      localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
    } catch {
      /* the frame's name is then elsewhere, and the test says so */
    }
  }, `onecamp:board:viewport:${BOARD}`)
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [], collab, fixtures: boardFixtures([board], USERS.sam, USERS.sam) })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const all = () => [...(collab.doc(NAME).getMap("elements").values() as Iterable<Shared>)].filter((e) => !e.isDeleted)
  const frames = () => all().filter((e) => e.type === "frame")
  const at = (id: string) => {
    const e = all().find((x) => x.id === id)
    return e ? [e.x, e.y] : null
  }
  return { context, page, all, frames, at }
}

// A phone turned sideways keeps the Frames sheet (touch, under 500 px tall), where eight sizes can't fit: the cut
// falls inside a row, so a part-row says the list scrolls (miro-11 F1, DESIGN-BUILD-117).
test("on a phone turned sideways, Add a frame's sizes show a part-row at the sheet's cut", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "sideways", [])
  const { page } = b
  const options = page.getByRole("button", { name: "Board options" })
  if (await options.isVisible()) {
    await options.tap()
    await page.getByRole("menuitem", { name: "Frames" }).tap()
  } else {
    await page.getByRole("button", { name: "Frames", exact: true }).tap()
  }
  const sheet = page.locator("[data-frames-panel][data-v3-sheet]")
  await expect(sheet).toBeVisible()
  await sheet.getByRole("button", { name: "Add a frame" }).tap()
  const sizes = sheet.getByRole("list", { name: "Frame sizes" })
  await expect(sizes.getByRole("button")).toHaveCount(8)
  await expect(sheet).toHaveAttribute("data-detent", "medium")
  await expect(sheet.getByRole("button", { name: "Back to frames" })).toBeInViewport({ ratio: 1 })
  await expect
    .poll(async () => {
      const body = (await sheet.locator("[data-sheet-body]").boundingBox())!
      const cut = body.y + body.height
      const rows = await Promise.all((await sizes.getByRole("button").all()).map((r) => r.boundingBox()))
      return rows.some((r) => r !== null && r.y < cut - 8 && r.y + r.height > cut + 8)
    })
    .toBe(true)
  await b.context.close()
})

for (const device of ["computer", "phone"] as const) {
  test(`a frame starts at a size, from ${device === "phone" ? "the Frames panel's Add a frame" : "the Frame tool"} (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device, note("agenda", 40, 40, "Agenda"))
    const { page } = b
    let size: { id: string; width: number; height: number }
    if (device === "computer") {
      await page.getByRole("button", { name: "Frame", exact: true }).click()
      const presets = page.locator("[data-frame-presets]")
      await expect(presets.getByRole("list", { name: "Frame sizes" }).getByRole("button")).toHaveCount(8)
      await presets.getByRole("button", { name: /^16:9/ }).click()
      size = { id: "16:9", width: 1920, height: 1080 }
    } else {
      // A phone draws no Frame tool: Board options, Frames, then Add a frame at the sheet's foot.
      await expect(page.getByRole("button", { name: "Frame", exact: true })).toHaveCount(0)
      await page.getByRole("button", { name: "Board options" }).tap()
      await page.getByRole("menuitem", { name: "Frames" }).tap()
      const sheet = page.locator("[data-frames-panel]")
      await expect(sheet).toBeVisible()
      await expect(sheet.getByText(/^Add one below\. Frames keep/)).toBeVisible()
      await page.getByRole("button", { name: "Add a frame" }).tap()
      const sizes = sheet.getByRole("list", { name: "Frame sizes" })
      await expect(sizes.getByRole("button")).toHaveCount(8)
      // Touch-sized rows.
      expect((await sizes.getByRole("button", { name: /^A4/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
      // The sheet grows to fit all eight: Phone, the last, sits whole above the pinned footer (miro-11 F1: half cut it off).
      const body = sheet.locator("[data-sheet-body]")
      const bottom = async () => {
        const box = (await body.boundingBox())!
        return box.y + box.height
      }
      await expect(sheet).toHaveAttribute("data-detent", "medium")
      await expect
        .poll(async () => {
          const phone = (await sizes.getByRole("button", { name: /^Phone/ }).boundingBox())!
          return phone.y + phone.height <= (await bottom()) + 0.5
        })
        .toBe(true)
      await expect(sheet.getByRole("button", { name: "Back to frames" })).toBeInViewport({ ratio: 1 })
      await sizes.getByRole("button", { name: /^A4/ }).tap()
      // The sheet closes to show the frame.
      await expect(sheet).toBeHidden()
      size = { id: "a4", width: 794, height: 1123 }
    }
    // One frame of that size, named, for everyone on the board, and selected: its bar is up.
    await expect.poll(() => b.frames().map((f) => [f.width, f.height, f.name, f.customData?.preset]), { timeout: 10_000 }).toEqual([[size.width, size.height, "Frame 1", size.id]])
    await expect(page.locator("[data-frame-bar]")).toBeVisible()
    await b.context.close()
  })

  test(`a frame lays out its notes in a grid, in rows and in columns, growing to hold them (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    // Four notes of three sizes, scattered in a frame 600 × 480 at (130, 150).
    const notes = [
      ...note("a", 140, 160, "Goals", { size: 240 }),
      ...note("b", 600, 180, "Risks", { size: 120 }),
      ...note("c", 160, 440, "Owners", { size: 180 }),
      ...note("d", 520, 480, "Dates", { size: 120 }),
    ]
    const ideas = frame("ideas", "Ideas", notes.filter((e) => e.type === "rectangle"))
    for (const e of notes) e.frameId = "ideas"
    const b = await open(browser, device, [ideas, ...notes])
    const { page } = b
    // Whether each note's words sit inside it.
    const wordsInside = () =>
      ["a", "b", "c", "d"].every((id) => {
        const n = b.all().find((e) => e.id === id)!
        const l = b.all().find((e) => e.type === "text" && (e as { containerId?: string }).containerId === id)!
        return l.x >= n.x && l.y >= n.y && l.x + l.width <= n.x + n.width && l.y + l.height <= n.y + n.height
      })

    // The frame's name, drawn just above its top left corner.
    const canvas = await page.locator(".excalidraw").first().boundingBox()
    if (!canvas) throw new Error("the canvas isn't on the page")
    if (device === "phone") await page.touchscreen.tap(canvas.x + 140, canvas.y + 140)
    else await page.mouse.click(canvas.x + 140, canvas.y + 140)
    const bar = page.locator("[data-frame-bar]")
    await expect(bar).toBeVisible()
    const press = async (name: string) => (device === "phone" ? bar.getByRole("button", { name }).tap() : bar.getByRole("button", { name }).click())
    const where = () => ["a", "b", "c", "d"].map((id) => b.at(id))

    // A grid of equal cells (the largest note's), 24 apart, from the frame's corner and 40 in; the frame grows to hold it.
    await press("Lay out in grid")
    await expect.poll(where, { timeout: 10_000 }).toEqual([[170, 190], [434, 190], [170, 454], [434, 454]])
    await expect.poll(() => b.frames().map((f) => [f.x, f.y, f.width, f.height])).toEqual([[130, 150, 600, 584]])
    // Each note's words move with it.
    await expect.poll(wordsInside).toBe(true)

    // Rows: each note as wide as it is, wrapping at the frame's width.
    await press("Lay out in rows")
    await expect.poll(where, { timeout: 10_000 }).toEqual([[170, 190], [434, 190], [170, 454], [374, 454]])

    // Columns: each note as tall as it is, wrapping at the frame's height.
    await press("Lay out in columns")
    await expect.poll(where, { timeout: 10_000 }).toEqual([[170, 190], [170, 454], [434, 190], [434, 394]])
    await expect.poll(wordsInside).toBe(true)
    await expect.poll(() => b.frames().map((f) => [f.width, f.height])).toEqual([[600, 584]])
    await b.context.close()
  })
}

// miro-11 F2 (WB-137's live walk, 6 Nov): a note placed inside a frame joins it, so the frame's Lay out moves it; and a
// frame added at a size takes in the notes it wholly covers. Before, both stayed outside: "This frame is empty".
test("a note placed in a frame is the frame's, and its Lay out moves it (computer)", async ({ browser }) => {
  test.setTimeout(120_000)
  // The frame where the original layout test draws one (130, 150), clear of the title bar over the canvas.
  const box = { x: 140, y: 160, width: 600, height: 560 }
  const b = await open(browser, "computer", [frame("ideas", "Ideas", [box])])
  const { page } = b
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  await page.locator(".excalidraw").first().focus()
  await page.keyboard.press("n")
  await expect(page.locator("[data-note-ghost]")).toBeAttached()
  await page.mouse.click(canvas.x + 400, canvas.y + 400)
  await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
  await page.keyboard.type("Goals", { delay: 10 })
  await page.keyboard.press("Escape")
  const notes = () => b.all().filter((e) => e.type === "rectangle")
  await expect.poll(() => notes().map((n) => n.frameId), { timeout: 10_000 }).toEqual(["ideas"])
  // The frame's name, just above its top left corner, selects it; Lay out in grid puts the note at the frame's corner, 40 in.
  await page.mouse.click(canvas.x + 140, canvas.y + 140)
  const bar = page.locator("[data-frame-bar]")
  await expect(bar).toBeVisible()
  await bar.getByRole("button", { name: "Lay out in grid" }).click()
  await expect.poll(() => notes().map((n) => [n.x, n.y]), { timeout: 10_000 }).toEqual([[170, 190]])
  await b.context.close()
})

test("a note added on a phone, in a frame filling the view, is the frame's (phone)", async ({ browser }) => {
  test.setTimeout(120_000)
  const b = await open(browser, "phone", [frame("ideas", "Ideas", [{ x: 0, y: 0, width: 600, height: 1200 }])])
  const { page } = b
  await page.getByRole("button", { name: "Add a note" }).tap()
  await expect.poll(() => b.all().filter((e) => e.type === "rectangle").map((n) => n.frameId), { timeout: 10_000 }).toEqual(["ideas"])
  await b.context.close()
})

// DESIGN-BUILD-120 F1 (6 Nov): a note placed with its centre in a frame but across its edge looked in the frame and was
// in none: Lay out passed it by and the panel said Empty. It joins the frame under its centre, moved wholly inside.
const whollyIn = (n: Shared, f: Shared) => n.x >= f.x && n.y >= f.y && n.x + n.width <= f.x + f.width && n.y + n.height <= f.y + f.height

test("a note pressed 60 px inside a frame's edge joins it, wholly inside (computer)", async ({ browser }) => {
  test.setTimeout(120_000)
  // The frame at (130, 150), 620 x 580, as above; the press 60 px inside its left edge: the note (180) crosses it by 30.
  const b = await open(browser, "computer", [frame("ideas", "Ideas", [{ x: 140, y: 160, width: 600, height: 560 }])])
  const { page } = b
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  await page.locator(".excalidraw").first().focus()
  await page.keyboard.press("n")
  await expect(page.locator("[data-note-ghost]")).toBeAttached()
  await page.mouse.click(canvas.x + 190, canvas.y + 440)
  await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
  await page.keyboard.type("Goals", { delay: 10 })
  await page.keyboard.press("Escape")
  const placed = () => b.all().filter((e) => e.type !== "frame")
  await expect.poll(() => placed().map((e) => e.frameId), { timeout: 10_000 }).toEqual(["ideas", "ideas"])
  const note = placed().find((e) => e.type === "rectangle")!
  expect(whollyIn(note, b.frames()[0])).toBe(true)
  // Moved right the least it must, to the frame's padding (40) where Lay out sets notes; at the height it was put.
  expect([Math.round(note.x), Math.round(note.y)]).toEqual([170, 350])
  await b.context.close()
})

test("a note added on a phone, a frame's edge 60 px left of the view's middle, joins it, wholly inside (phone)", async ({ browser }) => {
  test.setTimeout(120_000)
  // The camera at the board's origin: Add a note centres it half the canvas across. The frame's left edge sits 60 px
  // left of that, and the frame runs far above and below it.
  const b = await open(browser, "phone", [frame("ideas", "Ideas", [{ x: 135, y: -400, width: 600, height: 2000 }], { pad: 0 })])
  const { page } = b
  const view = (await page.locator(".excalidraw").first().boundingBox())!
  expect(view.width / 2 - 135).toBe(60)
  await page.getByRole("button", { name: "Add a note" }).tap()
  const placed = () => b.all().filter((e) => e.type !== "frame")
  await expect.poll(() => placed().map((e) => e.frameId), { timeout: 10_000 }).toEqual(["ideas", "ideas"])
  const note = placed().find((e) => e.type === "rectangle")!
  expect(whollyIn(note, b.frames()[0])).toBe(true)
  expect(Math.round(note.x)).toBe(175)
  await b.context.close()
})

// V-605 + V-683: a frame added at a size lay at the view's middle over the notes there, and the Frames panel said Empty
// while one sat inside it; Tab's next note across its edge fell on the last, and a pasted list joined no frame. A frame
// added at a size goes beside what's there (nothing is under it, so Empty is true), and every note added in it joins
// it: a placed note, Tab's next and a pasted list, so its Lay out moves them all. One undo step takes the frame away.
const overlap = (a: Shared, b: Shared) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

type Opened = Awaited<ReturnType<typeof open>>
// The Frames panel: the toolbar's Frames on a computer, Board options > Frames on a phone (a sheet).
async function openFrames({ page }: Opened, device: "computer" | "phone") {
  if (device === "phone") {
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Frames" }).tap()
  } else await page.getByRole("button", { name: "Frames", exact: true }).click()
  const panel = page.locator("[data-frames-panel]")
  await expect(panel).toBeVisible()
  return panel
}
// A frame at a size: the Frame tool's 16:9 on a computer, the Frames sheet's Add a frame > A4 on a phone. Returns it.
async function addSize(b: Opened, device: "computer" | "phone") {
  const { page } = b
  const had = new Set(b.frames().map((f) => f.id))
  if (device === "computer") {
    await page.getByRole("button", { name: "Frame", exact: true }).click()
    await page.locator("[data-frame-presets]").getByRole("button", { name: /^16:9/ }).click()
  } else {
    const sheet = await openFrames(b, device)
    await sheet.getByRole("button", { name: "Add a frame" }).tap()
    await sheet.getByRole("list", { name: "Frame sizes" }).getByRole("button", { name: /^A4/ }).tap()
    await expect(sheet).toBeHidden()
  }
  await expect.poll(() => b.frames().length, { timeout: 10_000 }).toBe(had.size + 1)
  return b.frames().find((f) => !had.has(f.id))!
}

for (const device of ["computer", "phone"] as const) {
  test(`a frame added at a size goes beside the notes, and a note, Tab's next and a pasted list join it (${device})`, async ({ browser }) => {
    test.setTimeout(150_000)
    const b = await open(browser, device, note("agenda", 40, 40, "Agenda"))
    const { page } = b
    const go = (l: ReturnType<typeof page.locator>) => (device === "phone" ? l.tap() : l.click())
    const agenda = () => b.all().find((e) => e.id === "agenda")!
    let f = await addSize(b, device)
    if (device === "computer") {
      // One undo step takes the frame away, and nothing else.
      await page.locator(".excalidraw").first().focus()
      await page.keyboard.press("ControlOrMeta+z")
      await expect.poll(() => b.frames().length, { timeout: 10_000 }).toBe(0)
      expect(agenda().frameId ?? null).toBeNull()
      f = await addSize(b, device)
    }
    // Beside the note, never over it: the note is in no frame, and the frame holds nothing.
    expect(overlap(f, agenda())).toBe(false)
    expect(agenda().frameId ?? null).toBeNull()
    expect(b.all().filter((e) => e.frameId === f.id)).toEqual([])
    // The board went to the frame (an animated fit): its middle is the view's once it settles.
    await page.waitForTimeout(1_200)

    // A note at the view's middle, in the frame: the phone's Add a note, or N and a press on a computer.
    const view = (await page.locator(".excalidraw").first().boundingBox())!
    if (device === "phone") await page.getByRole("button", { name: "Add a note" }).tap()
    else {
      await page.locator(".excalidraw").first().focus()
      await page.keyboard.press("n")
      await expect(page.locator("[data-note-ghost]")).toBeAttached()
      await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2)
    }
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("Goals", { delay: 10 })
    // Tab ends its words and starts the next note beside it, typing.
    await page.keyboard.press("Tab")
    await expect.poll(() => b.all().filter((e) => e.type === "rectangle" && e.id !== "agenda").length, { timeout: 10_000 }).toBe(2)
    await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
    await page.keyboard.type("Risks", { delay: 10 })
    await page.keyboard.press("Escape")
    // A pasted list, at the view's middle: three notes.
    await page.evaluate((t) => {
      const data = new DataTransfer()
      data.setData("text/plain", t)
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
    }, "Owners\nDates\nBudget")
    const added = () => b.all().filter((e) => e.type === "rectangle" && e.id !== "agenda")
    await expect.poll(() => added().length, { timeout: 10_000 }).toBe(5)
    await expect.poll(() => added().map((n) => n.frameId), { timeout: 10_000 }).toEqual(Array(5).fill(f.id))
    // Their words are the frame's too.
    expect(b.all().filter((e) => e.type === "text" && e.frameId === f.id)).toHaveLength(5)
    expect(agenda().frameId ?? null).toBeNull()

    // The panel says what's on screen, and its row selects the frame; its Lay out moves all five.
    const panel = await openFrames(b, device)
    const row = panel.getByText("5 sticky notes", { exact: true })
    await expect(row).toBeVisible()
    await go(row)
    const bar = page.locator("[data-frame-bar]")
    await expect(bar).toBeVisible()
    const was = new Map(added().map((n) => [n.id, [n.x, n.y]]))
    await go(bar.getByRole("button", { name: "Lay out in grid" }))
    const frameNow = () => b.frames()[0]
    // A grid from the frame's corner, 40 in: the first note there, every note wholly inside the frame.
    await expect.poll(() => added().some((n) => n.x === frameNow().x + 40 && n.y === frameNow().y + 40), { timeout: 10_000 }).toBe(true)
    const inside = (n: Shared, g: Shared) => n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height
    expect(added().every((n) => inside(n, frameNow()))).toBe(true)
    expect(added().filter((n) => String(was.get(n.id)) !== String([n.x, n.y])).length).toBeGreaterThan(0)
    expect([agenda().x, agenda().y, agenda().frameId ?? null]).toEqual([40, 40, null])

    const dir = process.env.SHOTS_DIR
    if (dir) {
      await page.screenshot({ path: `${dir}/frames-join-${device}-light.png` })
      await page.emulateMedia({ colorScheme: "dark" })
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${dir}/frames-join-${device}-dark.png` })
    }
    await b.context.close()
  })

  test(`two sizes added in a row go a gap apart, in a line, over nothing (${device})`, async ({ browser }) => {
    test.setTimeout(120_000)
    const b = await open(browser, device, note("agenda", 40, 40, "Agenda"))
    const first = await addSize(b, device)
    // The board goes to the first (an animated fit), so the second is asked for right where the first is.
    await b.page.waitForTimeout(1_200)
    if (device === "phone") {
      // The Frames sheet's A4 goes beside the note and the board goes to it, by the camera the board keeps once it
      // settles (DESIGN-BUILD-129 F1): across the width, its name and top edge below the board's top bar (boardRoom; the
      // tool row is at the foot since design-22 4), its middle
      // above the Facilitation bar. The fit is Excalidraw's own over the whole canvas, so the bars at the foot still
      // cover the frame's last part, as every board "bring into view" on a phone does (V-826).
      const kept = () => b.page.evaluate((k) => localStorage.getItem(k), `onecamp:board:viewport:${BOARD}`)
      await expect.poll(kept, { timeout: 10_000 }).not.toBe(JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      const cam = JSON.parse((await kept())!) as { scrollX: number; scrollY: number; zoom: number }
      const canvas = (await b.page.locator(".excalidraw").first().boundingBox())!
      const f = b.frames().find((g) => g.id === first.id)!
      const left = canvas.x + (f.x + cam.scrollX) * cam.zoom
      const top = canvas.y + (f.y + cam.scrollY) * cam.zoom
      const room = await boardRoom(b.page)
      const bar = (await b.page.getByRole("toolbar", { name: "Facilitation" }).boundingBox())!
      expect([left >= 0, left + f.width * cam.zoom <= 390]).toEqual([true, true])
      expect([top >= room.top, top + (f.height * cam.zoom) / 2 <= bar.y]).toEqual([true, true])
      const dir = process.env.SHOTS_DIR
      if (dir) {
        await b.page.screenshot({ path: `${dir}/frames-size-phone-light.png` })
        await b.page.emulateMedia({ colorScheme: "dark" })
        await b.page.waitForTimeout(300)
        await b.page.screenshot({ path: `${dir}/frames-size-phone-dark.png` })
        await b.page.emulateMedia({ colorScheme: "light" })
      }
    }
    const second = await addSize(b, device)
    const [f1, f2] = [first, second].map((f) => b.frames().find((g) => g.id === f.id)!)
    const agenda = b.all().find((e) => e.id === "agenda")!
    expect([overlap(f1, f2), overlap(f1, agenda), overlap(f2, agenda)]).toEqual([false, false, false])
    // One gap (lib/board/sticky NOTE_GAP, 24) along one side, lined up along the other (the view's middle rounds).
    const gaps = [f2.x - (f1.x + f1.width), f1.x - (f2.x + f2.width), f2.y - (f1.y + f1.height), f1.y - (f2.y + f2.height)]
    const side = gaps.findIndex((g) => g >= 0)
    expect(side).toBeGreaterThanOrEqual(0)
    expect(Math.abs(gaps[side] - 24)).toBeLessThanOrEqual(2)
    expect(Math.abs(side < 2 ? f2.y - f1.y : f2.x - f1.x)).toBeLessThanOrEqual(2)
    // Nothing is under either, so both hold nothing and the note is in no frame.
    expect(b.all().filter((e) => e.frameId)).toEqual([])
    await b.context.close()
  })
}
