import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, dropCollabSocket, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { reviewShotInThemes } from "./stubbedApp"
import { arrow, boardDoc, boardDocName, boardFixtures, boardInfo, frame, note, ordered, shape } from "../scripts/fluidity/fakeBoard.mjs"

// Layers on a board (miro-03): an editor makes a layer, names it, moves work onto it, reorders the stack (a mouse's
// drag on a computer, Move down on a phone) and the drawing's stack follows; hides it, and it is gone from Find, from a
// teammate's tab and from a share link's guest, and still hidden after a reload; locks it (the server's copy is locked
// and a drag can't move it); deletes it, and its work stays, on Layer 1. A delete undone on a hidden layer stays hidden
// and on the server through a template's undo and redo. A template's frames land locked. (Item 2, the
// protected lock only the owner lifts, is e2e/protectedLock.spec.ts, run in the same leg.)

const BOARD = "b0a4d000-0000-4000-8000-0000000000e9"
const NAME = boardDocName(BOARD)
const TOKEN = "guest-link-layers"
const LEVELS = { sam: "edit", ann: "edit", guest: "view" }
const BLUE = { r: 0x2f, g: 0x6b, b: 0xff }
const ORANGE = { r: 0xff, g: 0x8a, b: 0x00 }
const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES
type Shared = { id: string; x: number; locked?: boolean; isDeleted?: boolean; type: string; customData?: { layerId?: string } }

// Scene points (the camera at 0, 0, zoom 1), inside a 390 px phone's canvas: the low square alone, where the two
// squares overlap, the high square alone.
const LOW_ONLY = { x: 160, y: 120 }
const OVERLAP = { x: 265, y: 220 }
const HIGH_ONLY = { x: 350, y: 300 }

function layeredBoard(levels: Record<string, string> = LEVELS) {
  const elements = [...note("venue", 20, 300, "Book the venue"), shape("low", "rectangle", 140, 100, 160, 160, { fill: "#2F6BFF" }), shape("high", "rectangle", 230, 180, 160, 160, { fill: "#FF8A00" })]
  const board = { uuid: BOARD, title: "Launch plan", levels, update: boardDoc(ordered(elements)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}
type Board = ReturnType<typeof layeredBoard>

const camera = (key: string) => {
  try {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
  } catch {
    /* the squares are then elsewhere, and the colours say so */
  }
}

async function openMember(browser: Browser, device: Device, on: Board, user = USERS.sam) {
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(camera, `onecamp:board:viewport:${BOARD}`)
  const fixtures: Array<[RegExp, unknown]> = [[/\/board\/getBoardInfo\/[^/]+$/, () => ({ msg: "ok", data: boardInfo(on.board, user, USERS.sam) })], ...boardFixtures([on.board], user, USERS.sam)]
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab: on.collab, fixtures })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

async function openGuest(browser: Browser, on: Board, { device = "computer", capability = "view" }: { device?: Device; capability?: "view" | "edit" } = {}) {
  const context = await browser.newContext(DEVICES[device])
  await context.addInitScript(camera, `onecamp:board:viewport:${BOARD}`)
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability, title: "Launch plan", workspace_name: "Acme" }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: on.collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${TOKEN}`)
  if (capability === "edit") {
    // An edit link asks the guest's name before the board opens.
    await page.getByLabel("Your name, as the team will see it").fill("Vic")
    await page.getByRole("button", { name: "Continue" })[press(device)]()
  }
  await expect(page.locator("[data-guest-board][data-board-elements]")).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

/** Whether the board is drawn in this colour at a scene point (the camera at 0, 0, zoom 1). */
const drawnAt = (page: Page, at: { x: number; y: number }, c: { r: number; g: number; b: number }) =>
  page.evaluate(
    ([at, c]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.static")
      if (!canvas) return false
      const k = canvas.width / canvas.clientWidth
      const [r, g, b] = canvas.getContext("2d")!.getImageData(Math.floor(at.x * k), Math.floor(at.y * k), 1, 1).data
      return Math.abs(r - c.r) < 12 && Math.abs(g - c.g) < 12 && Math.abs(b - c.b) < 12
    },
    [at, c] as const,
  )

/** Whether this colour is drawn anywhere on the board: a share link's viewer frames the board's work itself (no saved camera). */
const drawnAnywhere = (page: Page, c: { r: number; g: number; b: number }) =>
  page.evaluate((c) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".excalidraw canvas.static")
    if (!canvas) return false
    const px = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - c.r) < 12 && Math.abs(px[i + 1] - c.g) < 12 && Math.abs(px[i + 2] - c.b) < 12) return true
    return false
  }, c)

const server = (on: Board) => (id: string) => on.collab.doc(NAME).getMap("elements").get(id) as Shared | undefined
const press = (device: Device) => (device === "phone" ? "tap" : "click")

async function openLayers(page: Page, device: Device) {
  // A computer's board menu is the title bar's More; a phone's is Board options in its top cluster.
  if (device === "phone") await page.getByRole("button", { name: "Board options" }).tap()
  else await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
  await page.getByRole("menuitem", { name: "Layers" })[press(device)]()
  return device === "phone" ? page.getByRole("dialog", { name: "Layers" }) : page.getByRole("complementary", { name: "Layers" })
}

async function at(page: Page, device: Device, p: { x: number; y: number }) {
  const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  if (device === "phone") await page.touchscreen.tap(box.x + p.x, box.y + p.y)
  else await page.mouse.click(box.x + p.x, box.y + p.y)
}

for (const device of ["computer", "phone"] as const) {
  test(`layers on a ${device}: make, name, move work, reorder, hide for everyone, reload, lock, delete`, async ({ browser }) => {
    test.setTimeout(180_000)
    const on = layeredBoard()
    const el = server(on)
    const { context, page } = await openMember(browser, device, on)
    const b = press(device)
    let panel = await openLayers(page, device)
    await expect(panel.getByRole("listitem")).toHaveCount(1)
    await panel.getByRole("button", { name: "New layer" })[b]()
    await panel.getByRole("button", { name: "Rename layer" })[b]()
    await panel.getByRole("textbox", { name: "Layer name" }).fill("Sketches")
    await panel.getByRole("textbox", { name: "Layer name" }).press("Enter")
    await expect(panel.locator("[data-layer-name]")).toHaveText(["Sketches", "Layer 1"])
    const sketches = on.collab.doc(NAME).getMap("layers").toJSON() as Record<string, { name: string }>
    const id = Object.keys(sketches).find((k) => sketches[k].name === "Sketches")!

    // Work onto the layer: a marquee takes the note and the low square on a computer; a phone taps the square.
    if (device === "computer") {
      const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
      await page.mouse.move(box.x + 315, box.y + 495)
      await page.mouse.down()
      await page.mouse.move(box.x + 10, box.y + 90, { steps: 8 })
      await page.mouse.up()
    } else {
      await page.keyboard.press("Escape")
      await at(page, device, LOW_ONLY)
      panel = await openLayers(page, device)
    }
    await panel.getByRole("button", { name: "Move selection here" })[b]()
    await expect.poll(() => el("low")?.customData?.layerId).toBe(id)
    // The stack follows the layers: the low square, now on the top layer, draws over the high one.
    await expect.poll(() => drawnAt(page, OVERLAP, BLUE)).toBe(true)

    // Reorder: a mouse drags Layer 1 over Sketches; a phone moves Sketches down.
    if (device === "computer") await panel.locator('[data-layer-name="Layer 1"]').dragTo(panel.locator('[data-layer-name="Sketches"]'))
    else await panel.getByRole("button", { name: "Move Sketches down" }).tap()
    await expect(panel.locator("[data-layer-name]")).toHaveText(["Layer 1", "Sketches"])
    await expect.poll(() => drawnAt(page, OVERLAP, ORANGE)).toBe(true)

    // Hide: gone here, from Find, in a teammate's tab and for a share link's guest; never deleted on the server.
    await panel.getByRole("button", { name: "Hide Sketches" })[b]()
    await expect.poll(() => drawnAt(page, LOW_ONLY, BLUE)).toBe(false)
    expect(el("low")?.isDeleted ?? false).toBe(false)
    await reviewShotInThemes(page, "layers-hidden")
    if (device === "computer") {
      const ann = await openMember(browser, "computer", on, USERS.ann)
      await expect.poll(() => drawnAt(ann.page, OVERLAP, ORANGE)).toBe(true)
      expect(await drawnAt(ann.page, LOW_ONLY, BLUE)).toBe(false)
      await ann.context.close()
      const guest = await openGuest(browser, on)
      await expect.poll(() => drawnAnywhere(guest.page, ORANGE)).toBe(true)
      expect(await drawnAnywhere(guest.page, BLUE)).toBe(false)
      await guest.context.close()
      await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
      await page.getByRole("menuitem", { name: "Find and replace" }).click()
      await page.getByRole("textbox", { name: "Find on board" }).fill("Book the venue")
      await expect(page.getByText("Nothing on this board says that.")).toBeVisible()
    }
    await page.reload()
    await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
    await expect.poll(() => drawnAt(page, OVERLAP, ORANGE)).toBe(true)
    expect(await drawnAt(page, LOW_ONLY, BLUE)).toBe(false)
    panel = await openLayers(page, device)
    await panel.getByRole("button", { name: "Show Sketches" })[b]()
    await expect.poll(() => drawnAt(page, LOW_ONLY, BLUE)).toBe(true)

    // Lock: the server's copy is locked, and a drag doesn't move it.
    await panel.getByRole("button", { name: "Lock Sketches" })[b]()
    await expect.poll(() => el("low")?.locked).toBe(true)
    await reviewShotInThemes(page, "layers-locked")
    const x = el("low")!.x
    if (device === "computer") {
      await page.keyboard.press("Escape")
      const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
      await page.mouse.move(box.x + LOW_ONLY.x, box.y + LOW_ONLY.y)
      await page.mouse.down()
      await page.mouse.move(box.x + LOW_ONLY.x + 120, box.y + LOW_ONLY.y + 60, { steps: 6 })
      await page.mouse.up()
      await page.waitForTimeout(400)
      expect(el("low")!.x).toBe(x)
      // A computer's side panel stays open through Escape and a drag (its menu item would toggle it shut).
      await expect(panel).toBeVisible()
    }

    // Delete: softly; the square stays, on Layer 1.
    await panel.getByRole("button", { name: "Sketches", exact: true })[b]()
    await panel.getByRole("button", { name: "Delete layer" })[b]()
    await expect(panel.locator("[data-layer-name]")).toHaveText(["Layer 1"])
    expect(on.collab.doc(NAME).getMap("layers").get(id)).toMatchObject({ deletedAt: expect.any(Number) })
    expect(el("low")?.isDeleted ?? false).toBe(false)
    await expect.poll(() => drawnAt(page, LOW_ONLY, BLUE)).toBe(true)
    await context.close()
  })
}

test("a delete undone on a hidden layer stays hidden and on the server, through a template's undo and redo", async ({ browser }) => {
  // Excalidraw's own undo restores an element past the layer filter; were it left drawn, the next undoable write (a
  // template) would hand it through the filter, which hid it inside that step, and redoing the step deleted it.
  test.setTimeout(150_000)
  const on = layeredBoard()
  const el = server(on)
  const { context, page } = await openMember(browser, "computer", on)
  const panel = await openLayers(page, "computer")
  await panel.getByRole("button", { name: "New layer" }).click()
  await panel.getByRole("button", { name: "Rename layer" }).click()
  await panel.getByRole("textbox", { name: "Layer name" }).fill("Sketches")
  await panel.getByRole("textbox", { name: "Layer name" }).press("Enter")
  await at(page, "computer", LOW_ONLY)
  await panel.getByRole("button", { name: "Move selection here" }).click()
  await expect.poll(() => !!el("low")?.customData?.layerId).toBe(true)
  await at(page, "computer", LOW_ONLY)
  await page.keyboard.press("Delete")
  await expect.poll(() => el("low")?.isDeleted).toBe(true)
  await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
  await page.locator('[data-testid="button-undo"]').click()
  await expect.poll(() => el("low")?.isDeleted).toBe(false)
  await page.waitForTimeout(1000)
  expect(await drawnAnywhere(page, BLUE)).toBe(false)
  const all = () => Array.from(on.collab.doc(NAME).getMap("elements").values()) as Shared[]
  const before = new Set(all().map((e) => e.id))
  const placed = () => all().filter((e) => !before.has(e.id) && !e.isDeleted).length
  await page.getByRole("button", { name: "Templates" }).click()
  await page.getByRole("combobox", { name: "Find a template" }).fill("continue")
  await page.getByRole("option", { name: /Start, stop, continue/ }).click()
  await expect.poll(placed, { timeout: 15_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(1000)
  await page.locator('[data-testid="button-undo"]').click()
  await expect.poll(placed).toBe(0)
  await page.locator('[data-testid="button-redo"]').click()
  await expect.poll(placed).toBeGreaterThan(0)
  await page.waitForTimeout(1000)
  expect(el("low")?.isDeleted).toBe(false)
  expect(await drawnAnywhere(page, BLUE)).toBe(false)
  await panel.getByRole("button", { name: "Show Sketches", exact: true }).click()
  await expect.poll(() => drawnAnywhere(page, BLUE)).toBe(true)
  expect(el("low")?.isDeleted).toBe(false)
  await context.close()
})

test("a template's frames land locked, its notes free", async ({ browser }) => {
  test.setTimeout(120_000)
  const on = layeredBoard()
  const { context, page } = await openMember(browser, "computer", on)
  const all = () => Array.from(on.collab.doc(NAME).getMap("elements").values()) as Shared[]
  const before = new Set(all().map((e) => e.id))
  await page.getByRole("button", { name: "Templates" }).click()
  await page.getByRole("combobox", { name: "Find a template" }).fill("continue")
  await page.getByRole("option", { name: /Start, stop, continue/ }).click()
  const placed = () => all().filter((e) => !before.has(e.id))
  await expect.poll(() => placed().filter((e) => e.type === "frame").length).toBe(3)
  expect(placed().filter((e) => e.type === "frame").every((e) => e.locked === true)).toBe(true)
  expect(placed().filter((e) => e.type !== "frame").length).toBeGreaterThan(0)
  expect(placed().filter((e) => e.type !== "frame").some((e) => e.locked === true)).toBe(false)
  // Select all from the empty ground: the notes take the selection, the locked frames don't (what the shot shows).
  const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  await page.mouse.click(box.x + 700, box.y + 600)
  await page.keyboard.press("ControlOrMeta+a")
  await reviewShotInThemes(page, "layers-template")
  await context.close()
})

// CR-401 F1: an edit made while drawn, then its layer hidden (here, or in a teammate's tab), then Excalidraw's Undo
// and Redo. Excalidraw keeps an element that leaves the scene as a deleted copy, and the undo of an earlier edit lands
// on that copy: the server must never hold the element deleted, and Show must draw it as the edit left it, the other
// shapes as they were.
const ORANGE_AT = { x: 150, y: 110 }
const GREEN = { r: 0x2f, g: 0xbf, b: 0x71 }
const NOTE_FILL = { r: 0xff, g: 0xf6, b: 0xd6 }
type Copy = Shared & { y?: number; width?: number; height?: number; backgroundColor?: string; text?: string }

function editBoard() {
  const kids = [shape("k1", "rectangle", 560, 130, 120, 70, { fill: "#2FBF71" }), shape("k2", "rectangle", 560, 230, 120, 70, { fill: "#2FBF71" })]
  const elements = [
    ...note("venue", 20, 300, "Book the venue"),
    shape("low", "rectangle", 140, 100, 160, 160, { fill: "#2F6BFF" }),
    shape("high", "rectangle", 230, 180, 160, 160, { fill: "#FF8A00" }),
    ...kids,
    frame("plan", "Plan", kids),
  ]
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(ordered(elements)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
}
const ALL = ["venue", "venue-label", "low", "high", "k1", "k2", "plan"]

/** What an edit changes and a layer keeps, per element, as the server holds it. */
const kept = (on: Board, ids: readonly string[]) =>
  ids.map((id) => {
    const e = server(on)(id) as Copy | undefined
    return { id, x: e?.x, y: e?.y, width: e?.width, height: e?.height, fill: e?.backgroundColor, text: e?.text, deleted: e?.isDeleted ?? false, layer: e?.customData?.layerId }
  })

/** Every key of these ids the server ever stores deleted, from now on. */
function deletions(on: Board, ids: readonly string[]): string[] {
  const seen: string[] = []
  const map = on.collab.doc(NAME).getMap("elements")
  map.observe((ev: { keysChanged: Set<string> }) => {
    for (const id of ev.keysChanged) if (ids.includes(id) && (map.get(id) as Shared | undefined)?.isDeleted) seen.push(id)
  })
  return seen
}

// Excalidraw hears keys only inside its container (handleKeyboardGlobally is off): from a panel's button, the board takes focus.
const focusBoard = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".excalidraw-container, .excalidraw")?.focus())

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  const a = await point(page, from)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + by.x / 2, a.y + by.y / 2, { steps: 4 })
  await page.mouse.move(a.x + by.x, a.y + by.y, { steps: 4 })
  await page.mouse.up()
}

async function point(page: Page, p: { x: number; y: number }) {
  const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
  return { x: box.x + p.x, y: box.y + p.y }
}

/** Sketches, a new layer over Layer 1, and its id. */
async function sketchesLayer(page: Page, on: Board) {
  const panel = await openLayers(page, "computer")
  await panel.getByRole("button", { name: "New layer" }).click()
  await panel.getByRole("button", { name: "Rename layer" }).click()
  await panel.getByRole("textbox", { name: "Layer name" }).fill("Sketches")
  await panel.getByRole("textbox", { name: "Layer name" }).press("Enter")
  const layers = on.collab.doc(NAME).getMap("layers").toJSON() as Record<string, { name: string }>
  return { panel, id: Object.keys(layers).find((k) => layers[k].name === "Sketches")! }
}

type Edit = {
  name: string
  ids: string[]
  pick(page: Page): Promise<void>
  edit(page: Page, on: Board): Promise<void>
  drawn(page: Page): Promise<boolean>
}
// The selected square's style panel covers LOW_ONLY: a press on the square goes to its uncovered top-right.
const LOW_FREE = { x: 270, y: 125 }
const EDITS: Edit[] = [
  {
    name: "a drag",
    ids: ["low"],
    pick: (page) => at(page, "computer", LOW_ONLY),
    async edit(page, on) {
      const y0 = server(on)("low") as Copy
      await drag(page, LOW_FREE, { x: 0, y: 60 })
      await expect.poll(() => (server(on)("low") as Copy).y).not.toBe(y0.y)
    },
    drawn: (page) => drawnAnywhere(page, BLUE),
  },
  {
    name: "a resize",
    ids: ["low"],
    pick: (page) => at(page, "computer", LOW_ONLY),
    async edit(page, on) {
      // The top-right handle, 4 px out from the square's corner (300, 100).
      await drag(page, { x: 308, y: 92 }, { x: 40, y: -40 })
      await expect.poll(() => (server(on)("low") as Copy).width).not.toBe(160)
    },
    drawn: (page) => drawnAnywhere(page, BLUE),
  },
  {
    name: "a recolour",
    ids: ["low"],
    pick: (page) => at(page, "computer", LOW_ONLY),
    async edit(page, on) {
      // The orange square's style onto the blue one (copy and paste styles).
      await at(page, "computer", { x: 370, y: 320 })
      await focusBoard(page)
      await page.keyboard.press("ControlOrMeta+Alt+c")
      await at(page, "computer", LOW_FREE)
      await focusBoard(page)
      await page.keyboard.press("ControlOrMeta+Alt+v")
      await expect.poll(() => (server(on)("low") as Copy).backgroundColor?.toLowerCase()).toBe("#ff8a00")
    },
    drawn: (page) => drawnAt(page, ORANGE_AT, ORANGE),
  },
  {
    name: "a text edit",
    ids: ["venue", "venue-label"],
    pick: (page) => at(page, "computer", { x: 110, y: 390 }),
    async edit(page, on) {
      await focusBoard(page)
      await page.keyboard.press("Enter")
      await page.keyboard.press("ControlOrMeta+End")
      await page.keyboard.type(" today")
      await page.keyboard.press("Escape")
      await expect.poll(() => (server(on)("venue-label") as Copy | undefined)?.text ?? "").toContain("today")
    },
    drawn: (page) => drawnAnywhere(page, NOTE_FILL),
  },
  {
    name: "a frame's drag with its shapes",
    ids: ["plan", "k1", "k2"],
    pick: (page) => page.locator(".excalidraw").getByText("Plan", { exact: true }).click(),
    async edit(page, on) {
      const name = (await page.locator(".excalidraw").getByText("Plan", { exact: true }).boundingBox())!
      const box = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
      await drag(page, { x: name.x + name.width / 2 - box.x, y: name.y + name.height / 2 - box.y }, { x: 0, y: 60 })
      await expect.poll(() => (server(on)("k1") as Copy).y).not.toBe(130)
    },
    drawn: (page) => drawnAnywhere(page, GREEN),
  },
]

for (const edit of EDITS) {
  for (const who of ["here", "in a teammate's tab"] as const) {
    test(`${edit.name} while drawn, its layer hidden ${who}, then Undo and Redo: never deleted on the server, and Show draws the edit`, async ({ browser }) => {
      test.setTimeout(150_000)
      const on = editBoard()
      const sam = await openMember(browser, "computer", on)
      const page = sam.page
      const { panel, id } = await sketchesLayer(page, on)
      await edit.pick(page)
      await panel.getByRole("button", { name: "Move selection here" }).click()
      await expect.poll(() => edit.ids.every((k) => server(on)(k)?.customData?.layerId === id)).toBe(true)
      await edit.edit(page, on)
      await page.waitForTimeout(800)
      const edited = kept(on, edit.ids)
      const others = ALL.filter((k) => !edit.ids.includes(k))
      const before = kept(on, others)
      const deleted = deletions(on, edit.ids)
      const ann = who === "here" ? null : await openMember(browser, "computer", on, USERS.ann)
      if (ann) await (await openLayers(ann.page, "computer")).getByRole("button", { name: "Hide Sketches", exact: true }).click()
      else await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
      await expect(panel.getByRole("button", { name: "Show Sketches", exact: true })).toBeVisible({ timeout: 10_000 })
      await page.waitForTimeout(800)
      const undo = page.locator('[data-testid="button-undo"]')
      await undo.click()
      await page.waitForTimeout(1500)
      // Condition 6's GAP: one Undo that empties the stack undid more than one step.
      console.log(`GAP ${edit.name} ${who}: the undo stack is ${(await undo.isDisabled()) ? "empty" : "not empty"} after one Undo`)
      expect(deleted, "the Undo never deletes it on the server").toEqual([])
      expect(await edit.drawn(page), "still hidden after the Undo").toBe(false)
      await page.locator('[data-testid="button-redo"]').click()
      await page.waitForTimeout(1500)
      expect(deleted, "the Redo never deletes it on the server").toEqual([])
      expect(await edit.drawn(page), "still hidden after the Redo").toBe(false)
      expect(kept(on, others), "the other shapes as they were").toEqual(before)
      await panel.getByRole("button", { name: "Show Sketches", exact: true }).click()
      await expect.poll(() => edit.drawn(page), { message: "Show draws it" }).toBe(true)
      expect(kept(on, edit.ids), "as the edit left it").toEqual(edited)
      expect(kept(on, others), "the other shapes as they were").toEqual(before)
      await ann?.context.close()
      await sam.context.close()
    })
  }
}

// condition 2's must-store cases: a person's own delete always stores. (Undoing a delete stores: the test above,
// "a delete undone on a hidden layer stays hidden and on the server".) A teammate's tab that has not yet heard the
// Hide still draws the square, and deleting it there is that person's delete.
test("a teammate whose tab has not heard the Hide deletes the square: it is deleted on the server", async ({ browser }) => {
  test.setTimeout(150_000)
  const on = layeredBoard()
  const el = server(on)
  const sam = await openMember(browser, "computer", on)
  const { panel, id } = await sketchesLayer(sam.page, on)
  await at(sam.page, "computer", LOW_ONLY)
  await panel.getByRole("button", { name: "Move selection here" }).click()
  await expect.poll(() => el("low")?.customData?.layerId).toBe(id)
  const ann = await openMember(browser, "computer", on, USERS.ann)
  dropCollabSocket(sam.context, true)
  await (await openLayers(ann.page, "computer")).getByRole("button", { name: "Hide Sketches", exact: true }).click()
  await expect.poll(() => (on.collab.doc(NAME).getMap("layers").get(id) as { hidden?: boolean } | undefined)?.hidden).toBe(true)
  expect(await drawnAnywhere(sam.page, BLUE), "Sam's tab still draws it").toBe(true)
  await focusBoard(sam.page)
  await sam.page.keyboard.press("Delete")
  await sam.page.waitForTimeout(500)
  dropCollabSocket(sam.context, false)
  await expect.poll(() => el("low")?.isDeleted, { timeout: 30_000, message: "Sam's delete stored" }).toBe(true)
  await expect(panel.getByRole("button", { name: "Show Sketches", exact: true })).toBeVisible({ timeout: 30_000 })
  await ann.context.close()
  await sam.context.close()
})

// CR-420 F2 on layers (the m03 probe, 18 Nov): a teammate typing words on a layer that another tab hides keeps every
// word. The words, and their box, stay drawn in the typing tab until the words end; then the layer hides them there.
const PINK = { r: 0xd6, g: 0x33, b: 0x6c }
function typingBoard() {
  const [, words] = note("memo-box", 400, 80, "Plan the menu", { ink: "#D6336C" })
  const memo = { ...words, id: "memo", x: 400, y: 80, width: 260, height: 45, fontSize: 36, containerId: null, textAlign: "left", verticalAlign: "top" }
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(ordered([...note("venue", 20, 300, "Book the venue"), memo])) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
}
const TYPED = [
  { name: "a text box", ids: ["memo"], words: "memo", at: { x: 460, y: 100 }, start: "Plan the menu", ink: PINK },
  { name: "a shape's label", ids: ["venue", "venue-label"], words: "venue-label", at: { x: 110, y: 390 }, start: "Book the venue", ink: NOTE_FILL },
] as const
for (const t of TYPED) {
  test(`${t.name} hidden in another tab while a teammate types in it: every word reaches the server, and it hides once the words end`, async ({ browser }) => {
    test.setTimeout(150_000)
    const on = typingBoard()
    const el = server(on)
    // The words as typed: a label's text is wrapped to its box ("Book the venue\ntoday"), its originalText is not.
    const text = () => ({ text: (el(t.words) as (Copy & { originalText?: string }) | undefined)?.originalText, deleted: el(t.words)?.isDeleted ?? false })
    const sam = await openMember(browser, "computer", on)
    const { panel, id } = await sketchesLayer(sam.page, on)
    await at(sam.page, "computer", t.at)
    await panel.getByRole("button", { name: "Move selection here" }).click()
    await expect.poll(() => t.ids.every((k) => el(k)?.customData?.layerId === id)).toBe(true)
    const ann = await openMember(browser, "computer", on, USERS.ann)
    await expect.poll(() => drawnAnywhere(ann.page, t.ink)).toBe(true)
    // Ann opens the words and types; Sam hides Sketches meanwhile; Ann types the rest and ends the words.
    await at(ann.page, "computer", t.at)
    await focusBoard(ann.page)
    await ann.page.keyboard.press("Enter")
    const words = ann.page.locator("textarea.excalidraw-wysiwyg")
    await expect(words).toBeFocused()
    await ann.page.keyboard.press("ControlOrMeta+End")
    await ann.page.keyboard.type(" to")
    await expect.poll(() => text().text).toBe(`${t.start} to`)
    await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
    await expect.poll(() => (on.collab.doc(NAME).getMap("layers").get(id) as { hidden?: boolean } | undefined)?.hidden).toBe(true)
    await ann.page.waitForTimeout(1_000)
    await expect(words, "Ann's words stay open").toBeFocused()
    if (t.words === "venue-label") expect(await drawnAnywhere(ann.page, t.ink), "the box stays drawn while its words are open").toBe(true)
    await ann.page.keyboard.type("day")
    await ann.page.keyboard.press("Escape")
    await expect.poll(text, { message: "every word on the server once the words end" }).toEqual({ text: `${t.start} today`, deleted: false })
    await expect.poll(() => drawnAnywhere(ann.page, t.ink), { message: "the hidden layer hides it once the words end" }).toBe(false)
    // Ann's next step, a square on Layer 1: the words stay as she left them.
    await focusBoard(ann.page)
    await ann.page.keyboard.press("r")
    await drag(ann.page, { x: 520, y: 520 }, { x: 120, y: 80 })
    await ann.page.waitForTimeout(1_500)
    expect(text(), "after Ann's next step").toEqual({ text: `${t.start} today`, deleted: false })
    // Shown again, Ann's tab draws it.
    await panel.getByRole("button", { name: "Show Sketches", exact: true }).click()
    await expect.poll(() => drawnAnywhere(ann.page, t.ink), { message: "Show draws it in Ann's tab" }).toBe(true)
    expect(text()).toEqual({ text: `${t.start} today`, deleted: false })
    await ann.context.close()
    await sam.context.close()
  })
}

// N3: a person's pasted work never lands on a hidden layer. Layer 1 always shows, so new work lands on a shown layer;
// a copy keeps its shape's layer, and a copy of a hidden layer's shape lands on the top shown layer and stays drawn,
// whether its layer was hidden here (12) or in a teammate's tab (11). The move is outside undo (CR-401 F2): undoing the
// person's next step leaves the copy drawn, the paste's own Undo deletes it (the person's delete stores) and its Redo
// brings it back drawn on the shown layer, in both tabs.
for (const who of ["in a teammate's tab", "here"] as const) {
  test(`a copy of a shape pasted after its layer was hidden ${who} lands on the top shown layer and stays drawn, through the next step's undo and its own undo and redo`, async ({ browser }) => {
    test.setTimeout(150_000)
    const on = layeredBoard()
    const el = server(on)
    const all = () => Array.from(on.collab.doc(NAME).getMap("elements").values()) as Shared[]
    const start = new Set(all().map((e) => e.id))
    const fresh = () => all().filter((e) => !start.has(e.id) && !e.isDeleted)
    const sam = await openMember(browser, "computer", on)
    await sam.context.grantPermissions(["clipboard-read", "clipboard-write"])
    const page = sam.page
    const { panel, id } = await sketchesLayer(page, on)
    await at(page, "computer", LOW_ONLY)
    await panel.getByRole("button", { name: "Move selection here" }).click()
    await expect.poll(() => el("low")?.customData?.layerId).toBe(id)
    await focusBoard(page)
    await page.keyboard.press("ControlOrMeta+c")
    const ann = who === "here" ? null : await openMember(browser, "computer", on, USERS.ann)
    if (ann) await (await openLayers(ann.page, "computer")).getByRole("button", { name: "Hide Sketches", exact: true }).click()
    else await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
    await expect(panel.getByRole("button", { name: "Show Sketches", exact: true })).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => drawnAnywhere(page, BLUE)).toBe(false)
    const q = await point(page, { x: 760, y: 420 })
    await page.mouse.move(q.x, q.y)
    await focusBoard(page)
    await page.keyboard.press("ControlOrMeta+v")
    await expect.poll(() => fresh().length).toBe(1)
    await page.waitForTimeout(1000)
    expect(fresh().map((e) => e.customData?.layerId ?? "layer-1"), "the copy lands on Layer 1").toEqual(["layer-1"])
    expect(await drawnAnywhere(page, BLUE), "and stays drawn").toBe(true)
    if (ann) await expect.poll(() => drawnAnywhere(ann.page, BLUE), { message: "in the teammate's tab too" }).toBe(true)
    const copy = () => all().find((e) => !start.has(e.id))
    const state = async () => ({
      high: el("high")?.x,
      copy: { deleted: copy()?.isDeleted ?? false, layer: copy()?.customData?.layerId ?? "layer-1" },
      drawn: await drawnAnywhere(page, BLUE),
      teammate: ann ? await drawnAnywhere(ann.page, BLUE) : null,
    })
    const live = { deleted: false, layer: "layer-1" }
    const both = (drawn: boolean) => ({ drawn, teammate: ann ? drawn : null })
    const undo = page.locator('[data-testid="button-undo"]')
    const redo = page.locator('[data-testid="button-redo"]')
    // (i) the person's next step, a drag of the orange square, undone: the copy stays live, on Layer 1 and drawn.
    await drag(page, HIGH_ONLY, { x: 40, y: 0 })
    await expect.poll(() => el("high")?.x).not.toBe(230)
    await page.waitForTimeout(800)
    await undo.click()
    await page.waitForTimeout(1500)
    expect.soft(await state(), "undoing the next step leaves the copy drawn on Layer 1").toEqual({ high: 230, copy: live, ...both(true) })
    // (ii) the paste's own Undo (the next one that changes the copy) deletes it, and the delete stores; its Redo brings it back drawn.
    for (let i = 0; i < 3 && copy()?.isDeleted !== true && (await undo.isEnabled()); i++) {
      await undo.click()
      await page.waitForTimeout(1200)
    }
    expect.soft(await state(), "the paste's own undo deletes the copy, on the server too").toEqual({ high: 230, copy: { ...live, deleted: true }, ...both(false) })
    for (let i = 0; i < 3 && copy()?.isDeleted !== false && (await redo.isEnabled()); i++) {
      await redo.click()
      await page.waitForTimeout(1200)
    }
    expect(await state(), "its redo brings the copy back live, on Layer 1 and drawn").toEqual({ high: 230, copy: live, ...both(true) })
    expect(el("low")?.isDeleted ?? false).toBe(false)
    await ann?.context.close()
    await sam.context.close()
  })
}

// N3 for a share link's guest who may draw (CR-413 N3): the same move as a member's. The guest copies the board's work,
// a member hides Sketches, the guest pastes: every copy lands on a shown layer and is drawn in the guest's own view,
// never stored live but hidden from the person who made it.
for (const device of ["computer", "phone"] as const) {
  test(`a guest who may draw pastes a copy of a hidden layer's shape on a ${device}: it lands on the top shown layer, drawn for the guest`, async ({ browser }) => {
    test.setTimeout(120_000)
    const on = layeredBoard({ ...LEVELS, guest: "edit" })
    const el = server(on)
    const all = () => Array.from(on.collab.doc(NAME).getMap("elements").values()) as Shared[]
    const start = new Set(all().map((e) => e.id))
    const fresh = () => all().filter((e) => !start.has(e.id) && !e.isDeleted)
    const sam = await openMember(browser, "computer", on)
    const { panel, id } = await sketchesLayer(sam.page, on)
    await at(sam.page, "computer", LOW_ONLY)
    await panel.getByRole("button", { name: "Move selection here" }).click()
    await expect.poll(() => el("low")?.customData?.layerId).toBe(id)
    const guest = await openGuest(browser, on, { device, capability: "edit" })
    await guest.context.grantPermissions(["clipboard-read", "clipboard-write"])
    await expect.poll(() => drawnAnywhere(guest.page, BLUE), { message: "the guest sees the blue square" }).toBe(true)
    await focusBoard(guest.page)
    await guest.page.keyboard.press("ControlOrMeta+a")
    await guest.page.keyboard.press("ControlOrMeta+c")
    await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
    await expect.poll(() => drawnAnywhere(guest.page, BLUE), { message: "the hide reaches the guest" }).toBe(false)
    // Excalidraw pastes only while the pointer is over its canvas (it drops a paste whose cursor point is not the canvas),
    // so the pointer goes to the canvas's middle first, as the member case above does.
    const box = (await guest.page.locator(".excalidraw canvas.interactive").boundingBox())!
    await guest.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await focusBoard(guest.page)
    await guest.page.keyboard.press("ControlOrMeta+v")
    await expect.poll(() => fresh().length, { message: "the paste stores a copy of every piece" }).toBe(start.size)
    await guest.page.waitForTimeout(1000)
    expect([...new Set(fresh().map((e) => e.customData?.layerId ?? "layer-1"))], "every copy lands on Layer 1").toEqual(["layer-1"])
    await expect.poll(() => drawnAnywhere(guest.page, BLUE), { message: "and the guest sees the copy" }).toBe(true)
    expect(el("low")?.customData?.layerId, "the original stays on Sketches").toBe(id)
    await guest.context.close()
    await sam.context.close()
  })
}


// CR-436 variants (CR-436 N2): both Sketches items, one typed in; (c) the other stays hidden in the
// typing tab while the words are open; (b) both tabs hide the typed one once the words end; (d) Undo and Redo after.
for (const t of TYPED) {
  test(`CR436 ${t.name}: only the typed item is kept, both tabs hide it after, Undo/Redo never delete or draw it`, async ({ browser }) => {
    test.setTimeout(180_000)
    const on = typingBoard()
    const el = server(on)
    const text = () => ({ text: (el(t.words) as (Copy & { originalText?: string }) | undefined)?.originalText, deleted: el(t.words)?.isDeleted ?? false })
    const other = TYPED.find((o) => o !== t)!
    const sam = await openMember(browser, "computer", on)
    const { panel, id } = await sketchesLayer(sam.page, on)
    for (const o of [TYPED[1], TYPED[0]]) { // the label first: a selected text box's style panel covers the label
      await at(sam.page, "computer", o.at)
      await panel.getByRole("button", { name: "Move selection here" }).click()
      await expect.poll(() => o.ids.every((k) => el(k)?.customData?.layerId === id)).toBe(true)
    }
    const ann = await openMember(browser, "computer", on, USERS.ann)
    await expect.poll(() => drawnAnywhere(ann.page, t.ink)).toBe(true)
    await expect.poll(() => drawnAnywhere(ann.page, other.ink)).toBe(true)
    const deleted = deletions(on, [...t.ids, ...other.ids])
    const otherBefore = kept(on, other.ids)
    await at(ann.page, "computer", t.at)
    await focusBoard(ann.page)
    await ann.page.keyboard.press("Enter")
    const words = ann.page.locator("textarea.excalidraw-wysiwyg")
    await expect(words).toBeFocused()
    await ann.page.keyboard.press("ControlOrMeta+End")
    await ann.page.keyboard.type(" to")
    await expect.poll(() => text().text).toBe(`${t.start} to`)
    await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
    await expect.poll(() => (on.collab.doc(NAME).getMap("layers").get(id) as { hidden?: boolean } | undefined)?.hidden).toBe(true)
    await ann.page.waitForTimeout(1_000)
    await expect(words, "Ann's words stay open").toBeFocused()
    expect(await drawnAnywhere(ann.page, other.ink), "(c) the other Sketches item is hidden in Ann's tab while she types").toBe(false)
    await ann.page.keyboard.type("day")
    await ann.page.waitForTimeout(800)
    expect(await drawnAnywhere(ann.page, other.ink), "(c) still hidden after more keystrokes").toBe(false)
    expect(await drawnAnywhere(sam.page, t.ink), "(b) Sam's tab never draws the typed item").toBe(false)
    await ann.page.keyboard.press("Escape")
    await expect.poll(text, { message: "(a) every word on the server once the words end" }).toEqual({ text: `${t.start} today`, deleted: false })
    await expect.poll(() => drawnAnywhere(ann.page, t.ink), { message: "(b) Ann's tab hides it once the words end" }).toBe(false)
    await sam.page.waitForTimeout(1_000)
    expect(await drawnAnywhere(sam.page, t.ink), "(b) Sam's tab hides it once the words end").toBe(false)
    expect(await drawnAnywhere(sam.page, other.ink), "(b) Sam's tab hides the other").toBe(false)
    const edited = kept(on, t.ids)
    console.log(`CR436 ${t.name} edited ${JSON.stringify(edited.map((e) => [e.id, e.deleted, e.layer === id]))}`)
    // (d) Ann's Undo, then Redo (round 4's pattern: the button, 1.5 s rest).
    const undo = ann.page.locator('[data-testid="button-undo"]')
    await undo.click()
    await ann.page.waitForTimeout(1_500)
    console.log(`CR436 ${t.name} after Undo: server ${JSON.stringify(text())}, undo stack ${(await undo.isDisabled()) ? "empty" : "not empty"}`)
    expect(deleted, "(d) the Undo never deletes it on the server").toEqual([])
    expect(await drawnAnywhere(ann.page, t.ink), "(d) still hidden in Ann's tab after the Undo").toBe(false)
    expect(await drawnAnywhere(ann.page, other.ink), "(d) the other still hidden after the Undo").toBe(false)
    await ann.page.locator('[data-testid="button-redo"]').click()
    await ann.page.waitForTimeout(1_500)
    console.log(`CR436 ${t.name} after Redo: server ${JSON.stringify(text())}`)
    expect(deleted, "(d) the Redo never deletes it on the server").toEqual([])
    expect(await drawnAnywhere(ann.page, t.ink), "(d) still hidden in Ann's tab after the Redo").toBe(false)
    expect(await drawnAnywhere(sam.page, t.ink), "(d) still hidden in Sam's tab after the Redo").toBe(false)
    expect(text(), "(d) after Undo and Redo, every word").toEqual({ text: `${t.start} today`, deleted: false })
    expect(kept(on, other.ids), "the other item as it was").toEqual(otherBefore)
    await panel.getByRole("button", { name: "Show Sketches", exact: true }).click()
    await expect.poll(() => drawnAnywhere(ann.page, t.ink), { message: "Show draws it in Ann's tab" }).toBe(true)
    await expect.poll(() => drawnAnywhere(sam.page, t.ink), { message: "Show draws it in Sam's tab" }).toBe(true)
    await expect.poll(() => drawnAnywhere(ann.page, other.ink), { message: "Show draws the other in Ann's tab" }).toBe(true)
    expect(text()).toEqual({ text: `${t.start} today`, deleted: false })
    expect(deleted).toEqual([])
    await ann.context.close()
    await sam.context.close()
  })
}

// CR-436 edge (CR-436 N2): the words opened, NO keystroke after the hide, the typed box alone on the layer (the
// show() moves nothing, so no scene write wakes the rest-run): once the words end, does Ann's tab still hide it?
test("CR436b a text box alone on its layer, hidden while its words are open, ended with no keystroke after", async ({ browser }) => {
  test.setTimeout(150_000)
  const t = TYPED[0]
  const on = typingBoard()
  const el = server(on)
  const text = () => ({ text: (el(t.words) as (Copy & { originalText?: string }) | undefined)?.originalText, deleted: el(t.words)?.isDeleted ?? false })
  const sam = await openMember(browser, "computer", on)
  const { panel, id } = await sketchesLayer(sam.page, on)
  await at(sam.page, "computer", t.at)
  await panel.getByRole("button", { name: "Move selection here" }).click()
  await expect.poll(() => t.ids.every((k) => el(k)?.customData?.layerId === id)).toBe(true)
  const ann = await openMember(browser, "computer", on, USERS.ann)
  await expect.poll(() => drawnAnywhere(ann.page, t.ink)).toBe(true)
  await ann.page.waitForTimeout(1_000)
  await at(ann.page, "computer", t.at)
  await focusBoard(ann.page)
  await ann.page.keyboard.press("Enter")
  await expect(ann.page.locator("textarea.excalidraw-wysiwyg")).toBeFocused()
  await ann.page.waitForTimeout(1_000)
  await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
  await expect.poll(() => (on.collab.doc(NAME).getMap("layers").get(id) as { hidden?: boolean } | undefined)?.hidden).toBe(true)
  await ann.page.waitForTimeout(1_000)
  await ann.page.keyboard.press("Escape")
  await ann.page.waitForTimeout(3_000)
  const drawn = await drawnAnywhere(ann.page, t.ink)
  console.log(`CR436b after Escape, no keystroke: Ann's tab draws it: ${drawn}; server ${JSON.stringify(text())}`)
  expect(text(), "never deleted, words as they were").toEqual({ text: t.start, deleted: false })
  expect(drawn, "Ann's tab hides it once the words end").toBe(false)
  await ann.context.close()
  await sam.context.close()
})

// CR-436 N3: an arrow's label typed while another tab hides its layer. The keep holds the label's words and the arrow
// they ride drawn in the typing tab; every word reaches the server; once the words end, that tab hides both.
test("CR436 N3 an arrow's label hidden in another tab while a teammate types in it: the arrow stays drawn, every word reaches the server, both hide once the words end", async ({ browser }) => {
  test.setTimeout(150_000)
  const from = shape("from", "rectangle", 20, 300, 160, 100)
  const to = shape("to", "rectangle", 560, 300, 160, 100)
  const link = { ...arrow("link", from, to), strokeColor: "#FF8A00", boundElements: [{ type: "text", id: "link-label" }] }
  const [, words] = note("link-note", 300, 327, "Send it", { ink: "#D6336C" })
  const label = { ...words, id: "link-label", x: 300, y: 327.5, width: 140, height: 45, fontSize: 36, containerId: "link", textAlign: "center", verticalAlign: "middle" }
  const board = { uuid: BOARD, title: "Launch plan", levels: LEVELS, update: boardDoc(ordered([from, to, link, label])) }
  const on = { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
  const el = server(on)
  const text = () => ({ text: (el("link-label") as (Copy & { originalText?: string }) | undefined)?.originalText, deleted: el("link-label")?.isDeleted ?? false })
  const LINE = { x: 220, y: 350 } // on the arrow, clear of its label and of both boxes
  const sam = await openMember(browser, "computer", on)
  const { panel, id } = await sketchesLayer(sam.page, on)
  await at(sam.page, "computer", LINE)
  await panel.getByRole("button", { name: "Move selection here" }).click()
  await expect.poll(() => ["link", "link-label"].every((k) => el(k)?.customData?.layerId === id)).toBe(true)
  const deleted = deletions(on, ["from", "to", "link", "link-label"])
  const ann = await openMember(browser, "computer", on, USERS.ann)
  await expect.poll(() => drawnAnywhere(ann.page, ORANGE), { message: "Ann's tab draws the arrow" }).toBe(true)
  await expect.poll(() => drawnAnywhere(ann.page, PINK), { message: "Ann's tab draws its label" }).toBe(true)
  // Ann opens the arrow's words and types; Sam hides Sketches meanwhile; Ann types the rest and ends the words.
  await at(ann.page, "computer", LINE)
  await focusBoard(ann.page)
  await ann.page.keyboard.press("Enter")
  const typing = ann.page.locator("textarea.excalidraw-wysiwyg")
  await expect(typing).toBeFocused()
  await ann.page.keyboard.press("ControlOrMeta+End")
  await ann.page.keyboard.type(" to")
  await expect.poll(() => text().text).toBe("Send it to")
  await panel.getByRole("button", { name: "Hide Sketches", exact: true }).click()
  await expect.poll(() => (on.collab.doc(NAME).getMap("layers").get(id) as { hidden?: boolean } | undefined)?.hidden).toBe(true)
  await ann.page.waitForTimeout(1_000)
  await expect(typing, "Ann's words stay open").toBeFocused()
  await expect(typing, "the label's words stay shown").toHaveValue("Send it to")
  expect(await drawnAnywhere(ann.page, ORANGE), "the arrow stays drawn while its words are open").toBe(true)
  expect(await drawnAnywhere(sam.page, ORANGE), "Sam's tab hides the arrow").toBe(false)
  await ann.page.keyboard.type("day")
  await ann.page.waitForTimeout(800)
  expect(await drawnAnywhere(ann.page, ORANGE), "the arrow stays drawn after more keystrokes").toBe(true)
  await ann.page.keyboard.press("Escape")
  await expect.poll(text, { message: "every word on the server once the words end" }).toEqual({ text: "Send it today", deleted: false })
  await expect.poll(() => drawnAnywhere(ann.page, ORANGE), { message: "Ann's tab hides the arrow once the words end" }).toBe(false)
  expect(await drawnAnywhere(ann.page, PINK), "Ann's tab hides its label once the words end").toBe(false)
  await sam.page.waitForTimeout(1_000)
  expect(await drawnAnywhere(sam.page, ORANGE), "Sam's tab still hides the arrow").toBe(false)
  expect(await drawnAnywhere(sam.page, PINK), "Sam's tab hides its label").toBe(false)
  expect(["link", "link-label"].map((k) => el(k)?.customData?.layerId), "both stay on Sketches").toEqual([id, id])
  expect(deleted, "nothing deleted on the server").toEqual([])
  // Shown again, both tabs draw the arrow and its words.
  await panel.getByRole("button", { name: "Show Sketches", exact: true }).click()
  await expect.poll(() => drawnAnywhere(ann.page, ORANGE), { message: "Show draws the arrow in Ann's tab" }).toBe(true)
  await expect.poll(() => drawnAnywhere(ann.page, PINK), { message: "Show draws its label in Ann's tab" }).toBe(true)
  await expect.poll(() => drawnAnywhere(sam.page, PINK), { message: "Show draws its label in Sam's tab" }).toBe(true)
  expect(text()).toEqual({ text: "Send it today", deleted: false })
  await ann.context.close()
  await sam.context.close()
})
