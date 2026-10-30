import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { settled } from "./sheetLayout"

// The board's map and Here now's Jump to and Follow (miro-04 3 and 4), on a
// computer: the Map button at the end of the zoom and undo cluster opens a map
// of the whole drawing; a press on it brings that part of the board to the
// middle of the screen. With two people on the board, Here now jumps to the
// other one's pointer and follows it as it moves, over the live collaboration.

const BOARD = "b0a4d000-0000-4000-8000-0000000000c4"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit" }
const VIEWPORT = `onecamp:board:viewport:${BOARD}`
const COMPUTER = { viewport: { width: 1280, height: 860 } } satisfies BrowserContextOptions
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } satisfies BrowserContextOptions

/** A note near the origin and one a long way off, so the drawing is far wider and taller than a screen. */
function farBoard(notes = [...note("plan", 40, 120, "Launch plan"), ...note("far", 2400, 1600, "Far corner")]) {
  const board = { uuid: BOARD, title: "Launch map", levels: LEVELS, update: boardDoc(ordered(notes)) }
  const collab = collabFor([{ id: NAME, update: board.update, levels: LEVELS }])
  return { board, collab }
}

type Who = (typeof USERS)["sam"]
type Camera = { scrollX: number; scrollY: number; zoom: number }

/** One person's computer on the board, its camera put where `camera` says before the page opens. */
async function open(browser: Browser, who: Who, b: ReturnType<typeof farBoard>, camera: Camera, device: BrowserContextOptions = COMPUTER) {
  const context = await browser.newContext(device)
  await context.addInitScript(
    ([key, cam]) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(key, cam)
      } catch {
        /* the camera is then the drawing's, and the test says so */
      }
    },
    [VIEWPORT, JSON.stringify(camera)] as const,
  )
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: who, docs: [], collab: b.collab, fixtures: [...boardFixtures([b.board], who, USERS.sam)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  const canvas = await page.locator(".excalidraw").first().boundingBox()
  if (!canvas) throw new Error("the canvas isn't on the page")
  return { context, page, canvas }
}

/** The camera the board keeps for this page (it saves each move). */
const cameraOf = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as Camera | null, VIEWPORT)

/** Every island on the board as drawn, named: the notes pill, Excalidraw's tool row (its phone one), side tools and
 * footer, and each of the board's own bars by its label; with the board's box. Only what is drawn and visible. */
function islandsOf(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector(".excalidraw")!.getBoundingClientRect()
    const named = new Map<Element, string>()
    const pill = document.querySelector("[data-board-create]")
    if (pill) named.set(pill, "pill")
    for (const el of document.querySelectorAll(".App-toolbar--mobile")) named.set(el, "tools")
    for (const [sel, name] of [[".mobile-misc-tools-container", "Excalidraw's side tools"], [".App-bottom-bar > .Island", "Excalidraw's footer"]] as const)
      for (const el of document.querySelectorAll(sel)) named.set(el, name)
    for (const el of document.querySelectorAll("[data-board-chrome]"))
      if (!named.has(el)) named.set(el, el.getAttribute("aria-label") ?? el.querySelector("[aria-label]")?.getAttribute("aria-label") ?? "board chrome")
    const boxes = [...named].flatMap(([el, name]) => {
      const r = el.getBoundingClientRect()
      return r.width && r.height && getComputedStyle(el).visibility === "visible" ? [{ name, left: r.left, top: r.top, right: r.right, bottom: r.bottom }] : []
    })
    return { host: { left: host.left, top: host.top, right: host.right, bottom: host.bottom, width: host.width, height: host.height }, boxes }
  })
}
type Islands = Awaited<ReturnType<typeof islandsOf>>
type Edges = { left: number; top: number; right: number; bottom: number }

/** One line of every island's box, for the log: `<what> (<when>): board ...; name x-x yy-y, ...`. */
function logIslands(what: string, when: string, { host, boxes }: Islands) {
  const at = (n: number) => Math.round(n)
  console.log(`${what} (${when}): board ${at(host.left)}+${at(host.width)}x${at(host.height)}; ` + boxes.map((x) => `${x.name} ${at(x.left)}-${at(x.right)} y${at(x.top)}-${at(x.bottom)}`).join(", "))
}

/** How far apart two boxes are: the widest gap between them along either axis, negative when they share ground. */
const apart = (a: Edges, b: Edges) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom)

test.describe.configure({ timeout: 120_000 })

test("on a computer, the board's map opens from the zoom cluster, and a press on it brings that part of the board to the middle", async ({ browser }) => {
  const b = farBoard()
  const sam = await open(browser, USERS.sam, b, { scrollX: 0, scrollY: 0, zoom: 1 })
  const button = sam.page.getByRole("button", { name: "Board map", exact: true })
  // At the end of Excalidraw's zoom and undo cluster, with Zoom in before it.
  await expect(sam.page.locator(".layer-ui__wrapper__footer-left").getByRole("button", { name: "Board map", exact: true })).toBeVisible()
  await expect(button).toHaveAttribute("aria-pressed", "false")
  await button.click()
  await expect(button).toHaveAttribute("aria-pressed", "true")
  const map = sam.page.getByRole("application", { name: "Board map: press or drag to go there, or use the arrow keys" })
  await expect(map).toBeVisible()
  expect(await sam.page.evaluate(() => localStorage.getItem("onecamp:board:map"))).toBe("true")

  // The map sits above its button, inside the window.
  const box = (await map.boundingBox())!
  const at = (await button.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(at.y)
  expect(box.x + box.width).toBeLessThanOrEqual(COMPUTER.viewport.width)

  // A press at the map's far corner: the far note's part of the board comes to the middle.
  await sam.page.mouse.click(box.x + box.width - 8, box.y + box.height - 8)
  await expect.poll(async () => (await cameraOf(sam.page))?.scrollX ?? 0, { timeout: 10_000 }).toBeLessThan(-1500)
  expect((await cameraOf(sam.page))!.scrollY).toBeLessThan(-900)

  // With the map focused, an arrow key moves the board a quarter of the screen.
  const before = (await cameraOf(sam.page))!
  await map.focus()
  await sam.page.keyboard.press("ArrowLeft")
  await expect.poll(async () => Math.abs((await cameraOf(sam.page))!.scrollX - before.scrollX - sam.canvas.width / 4), { timeout: 10_000 }).toBeLessThan(1.5)

  // Open is kept: the next visit opens with the map.
  await sam.page.reload()
  await expect(sam.page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await expect(map).toBeVisible()
  await sam.context.close()
})

// DB-34's H8 M1: wider by the map button, the zoom cluster met Excalidraw's
// tool row at 1280 and ran under its rounded end. The bottom row is one
// measured layout (components/board/bottomRow.ts), and here it is measured as
// drawn, at 1280 and at the narrowest computer width with the sidebar open,
// with the map shut and open:
// - along the tool row's middle, every island keeps 8 px of bare canvas from
//   the next (what the pointer meets);
// - the pill, the tool row, the zoom cluster, the facilitation bar and the
//   open map keep 8 px apart wherever each is, side by side or one over the
//   other, all inside the board.
for (const width of [1280, 1024]) {
  test(`on a computer ${width} px wide, the bottom row's islands keep 8 px apart, the map's cluster too`, async ({ browser }) => {
    const b = farBoard()
    const sam = await open(browser, USERS.sam, b, { scrollX: 0, scrollY: 0, zoom: 1 }, { viewport: { width, height: 860 } })
    const button = sam.page.getByRole("button", { name: "Board map", exact: true })
    await expect(button).toBeVisible()
    await expect(sam.page.getByRole("toolbar", { name: "Notes and frames" })).toBeVisible()
    await expect(sam.page.getByRole("toolbar", { name: "Facilitation" })).toBeVisible()
    const row = () =>
      sam.page.evaluate(() => {
        const host = document.querySelector(".excalidraw")!.getBoundingClientRect()
        const tools = document.querySelector(".App-toolbar")!.getBoundingClientRect()
        // Left to right along the tool row's middle: what the pointer would meet, island or bare canvas.
        const y = Math.round(tools.top + tools.height / 2)
        const runs: { from: number; to: number; island: boolean }[] = []
        for (let x = Math.ceil(host.left) + 1; x < Math.floor(host.right) - 1; x++) {
          const el = document.elementFromPoint(x, y)
          const island = !!el && el.tagName !== "CANVAS"
          const last = runs[runs.length - 1]
          if (last && last.island === island) last.to = x
          else runs.push({ from: x, to: x, island })
        }
        const parts = {
          pill: "[data-board-create]",
          tools: ".App-toolbar",
          cluster: ".layer-ui__wrapper__footer-left > .Stack > section",
          bar: "[data-facilitation]",
          map: "[data-board-map]",
        }
        const boxes = Object.entries(parts).flatMap(([name, selector]) => {
          const el = document.querySelector<HTMLElement>(selector)
          if (!el) return []
          const r = el.getBoundingClientRect()
          return [{ name, left: r.left, top: r.top, right: r.right, bottom: r.bottom }]
        })
        return { host: { left: host.left, top: host.top, right: host.right, bottom: host.bottom, width: host.width }, runs, boxes }
      })
    for (const mapOpen of [false, true]) {
      if (mapOpen) {
        await button.click()
        await expect(sam.page.getByRole("application", { name: "Board map: press or drag to go there, or use the arrow keys" })).toBeVisible()
        // The row is measured again as the map opens: a frame for it to settle.
        await sam.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
      }
      const { host, runs, boxes } = await row()
      const islands = runs.filter((r) => r.island)
      const gaps = runs.filter((r, i) => !r.island && i > 0 && i < runs.length - 1).map((r) => r.to - r.from + 1)
      const at = (n: number) => Math.round(n)
      console.log(
        `bottom row at ${width} (map ${mapOpen ? "open" : "shut"}): board ${at(host.left)}+${at(host.width)}; islands ${islands.map((r) => `${r.from}-${r.to}`).join(" ")}; gaps ${gaps.join(" ")}; ` +
          boxes.map((x) => `${x.name} ${at(x.left)}-${at(x.right)} y${at(x.top)}-${at(x.bottom)}`).join(", "),
      )
      // The pill and the tool row at least, none run into another, each 8 px or more from the next.
      expect(islands.length, `islands at ${width}`).toBeGreaterThanOrEqual(2)
      expect(Math.min(...gaps), `the narrowest gap at ${width}`).toBeGreaterThanOrEqual(8)
      // Every two keep 8 px apart (to a tenth of a pixel), beside or over each other, and each is inside the board.
      expect(boxes.map((x) => x.name)).toEqual(mapOpen ? ["pill", "tools", "cluster", "bar", "map"] : ["pill", "tools", "cluster", "bar"])
      for (const [i, a] of boxes.entries()) {
        expect(a.left >= host.left && a.right <= host.right && a.top >= host.top && a.bottom <= host.bottom, `${a.name} inside the board at ${width}`).toBe(true)
        for (const c of boxes.slice(i + 1)) {
          expect(Math.round(apart(a, c) * 10) / 10, `${a.name} and ${c.name} apart at ${width}, map ${mapOpen ? "open" : "shut"}`).toBeGreaterThanOrEqual(8)
        }
      }
    }
    await sam.context.close()
  })
}

// Where the app draws its computer chrome (640 px and up) but Excalidraw draws its MobileMenu (on its own box:
// under 730 px wide, or under 500 tall and 1000 wide), Excalidraw's tool row is at the board's top and there is
// no zoom cluster: a 960 window with the sidebar expanded, a 700 window, a short 1000 window. The notes pill
// keeps a place there too (CR-85, H8 M1: it stayed hidden): whole, inside the board, and 8 px or more from the
// tool row and from every other island.
for (const [width, height, expand] of [[960, 860, true], [700, 860, false], [1000, 480, false]] as const) {
  const where = `${width}x${height}${expand ? " with the sidebar expanded" : ""}`
  test(`on a computer ${where}, where Excalidraw draws its phone tool row, the notes pill keeps a place`, async ({ browser }) => {
    const b = farBoard()
    const sam = await open(browser, USERS.sam, b, { scrollX: 0, scrollY: 0, zoom: 1 }, { viewport: { width, height } })
    if (expand) await sam.page.getByRole("button", { name: "Expand sidebar" }).click()
    await expect(sam.page.getByRole("toolbar", { name: "Facilitation" })).toBeVisible()
    // Excalidraw's own switch, on its own box: the phone's tool row, and no zoom cluster.
    await expect(sam.page.locator(".App-toolbar--mobile")).toBeVisible()
    await expect(sam.page.locator(".layer-ui__wrapper__footer-left")).toHaveCount(0)
    const pill = sam.page.getByRole("toolbar", { name: "Notes and frames" })
    const measure = () => islandsOf(sam.page)
    const log = (when: string, m: Islands) => logIslands(`no cluster at ${where}`, when, m)
    // Every island as drawn, before the pill is asked for: what the row is made of at this width.
    log("drawn", await measure())
    await expect(pill, `the notes pill at ${where}`).toBeVisible()
    const { host, boxes } = await measure()
    log("placed", { host, boxes })
    const p = boxes.find((x) => x.name === "pill")!
    expect(p.left >= host.left && p.right <= host.right && p.top >= host.top && p.bottom <= host.bottom, `the pill inside the board at ${where}`).toBe(true)
    // The pill keeps 8 px (to a tenth of a pixel) from every other island, beside or over it.
    for (const c of boxes.filter((x) => x !== p)) {
      expect(Math.round(apart(p, c) * 10) / 10, `the pill and ${c.name} apart at ${where}`).toBeGreaterThanOrEqual(8)
    }
    await sam.context.close()
  })
}

// There too, Excalidraw's tool row runs along the board's top, where the board's own clusters float: its name and
// More, and who is here with Share. They sat over the row's first and last tools (V-75, 29 Oct). Every one of the
// board's own bars keeps 8 px from Excalidraw's tool row, side tools and footer and from each other, whole on the
// screen, at the same sizes and on a tablet held upright (768 wide with touch: its board is under 730).
for (const [width, height, expand, touch] of [[960, 860, true, false], [700, 860, false, false], [768, 1024, false, true], [1000, 480, false, false]] as const) {
  const where = `${width}x${height}${expand ? " with the sidebar expanded" : ""}${touch ? " with touch" : ""}`
  test(`on a computer ${where}, where Excalidraw draws its phone tool row, the board's own bars keep off Excalidraw's`, async ({ browser }) => {
    const sam = await open(browser, USERS.sam, farBoard(), { scrollX: 0, scrollY: 0, zoom: 1 }, { viewport: { width, height }, hasTouch: touch })
    if (expand) await sam.page.getByRole("button", { name: "Expand sidebar" }).click()
    await expect(sam.page.locator(".App-toolbar--mobile")).toBeVisible()
    for (const name of ["Board", "Board tools", "Facilitation", "Notes and frames"]) await expect(sam.page.getByRole("toolbar", { name, exact: true })).toBeVisible()
    // The facilitation bar is a chunk of its own that lands after the board: measure once its rise is over.
    await settled(sam.page.getByRole("toolbar", { name: "Facilitation", exact: true }))
    const m = await islandsOf(sam.page)
    logIslands(`the board's bars at ${where}`, "drawn", m)
    const THEIRS = ["tools", "Excalidraw's side tools", "Excalidraw's footer"]
    const theirs = m.boxes.filter((x) => THEIRS.includes(x.name))
    const ours = m.boxes.filter((x) => !THEIRS.includes(x.name))
    expect(theirs.map((x) => x.name).sort(), `Excalidraw's islands at ${where}`).toEqual([...THEIRS].sort())
    expect(ours.map((x) => x.name), `the board's own bars at ${where}`).toEqual(expect.arrayContaining(["Board", "Board tools", "Facilitation", "pill"]))
    for (const [i, a] of ours.entries()) {
      expect(a.left >= 0 && a.right <= width && a.top >= 0 && a.bottom <= height, `${a.name} whole on the screen at ${where}`).toBe(true)
      for (const c of [...ours.slice(i + 1), ...theirs]) expect(Math.round(apart(a, c) * 10) / 10, `${a.name} and ${c.name} apart at ${where}`).toBeGreaterThanOrEqual(8)
    }
    // And the notes pill keeps its place by the tool row's start, 8 px off it: beside it, or under it.
    const pill = ours.find((x) => x.name === "pill")!
    const row = theirs.find((x) => x.name === "tools")!
    expect(Math.round(apart(pill, row)), `the pill by the tool row at ${where}`).toBeLessThanOrEqual(9)
    await sam.context.close()
  })
}

test("with two people on a board, Here now jumps to the other's pointer and follows it as it moves", async ({ browser }) => {
  const b = farBoard()
  const sam = await open(browser, USERS.sam, b, { scrollX: 0, scrollY: 0, zoom: 1 })
  // Ann is over at the far note, her pointer resting on her screen's middle.
  const ann = await open(browser, USERS.ann, b, { scrollX: -2200, scrollY: -1400, zoom: 1 })
  // One move, well after the last: a tab sends a resting pointer at most every 50 ms and drops the moves between.
  const pointAt = async (x: number, y: number) => {
    await ann.page.waitForTimeout(200)
    await ann.page.mouse.move(ann.canvas.x + x, ann.canvas.y + y)
  }
  // Where Ann's pointer is on the board, and the camera that puts it in the middle of Sam's screen.
  const middleFor = (x: number, y: number) => ({ scrollX: sam.canvas.width / 2 - (x + 2200), scrollY: sam.canvas.height / 2 - (y + 1400) })
  await pointAt(300, 250)

  await sam.page.getByRole("button", { name: /^Here now: / }).click()
  // The rows name people as the board's presence does (the fake app's Ann is "ann"), so names match in any case.
  const rows = sam.page.locator("[data-presence-rows]")
  await expect(rows).toBeVisible()
  await rows.getByRole("button", { name: /^Jump to ann\b/i }).click()
  const want = middleFor(300, 250)
  await expect.poll(async () => {
    const c = await cameraOf(sam.page)
    return c ? Math.max(Math.abs(c.scrollX - want.scrollX), Math.abs(c.scrollY - want.scrollY)) : Infinity
  }, { timeout: 10_000 }).toBeLessThan(3)

  // Follow: Sam's screen keeps Ann's pointer in its middle as she moves, and says so the whole time:
  // a frame in her hue, "Following ann" with Esc and Stop, and a status for a screen reader.
  const frame = sam.page.locator("[data-following]")
  const status = (words: string) => sam.page.getByRole("status").filter({ hasText: words })
  const follow = async () => {
    await sam.page.getByRole("button", { name: /^Here now: / }).click()
    await rows.getByRole("button", { name: /^Follow ann\b/i }).click()
    await expect(frame.getByText("Following ann", { exact: true })).toBeVisible()
    await expect(frame.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
    await expect(status("Following ann. Press Esc to stop.")).toHaveCount(1)
  }
  await follow()
  await pointAt(700, 500)
  const next = middleFor(700, 500)
  await expect.poll(async () => {
    const c = await cameraOf(sam.page)
    return c ? Math.max(Math.abs(c.scrollX - next.scrollX), Math.abs(c.scrollY - next.scrollY)) : Infinity
  }, { timeout: 10_000 }).toBeLessThan(3)

  // Sam presses Escape: following stops, the frame goes, the status says so, and Ann's next move is hers alone.
  await sam.page.keyboard.press("Escape")
  await expect(frame).toHaveCount(0)
  await expect(status("Stopped following ann")).toHaveCount(1)
  const held = (await cameraOf(sam.page))!
  await pointAt(200, 150)
  await sam.page.waitForTimeout(1_500)
  expect(await cameraOf(sam.page)).toEqual(held)

  // The frame's Stop ends it the same way, and so does Sam scrolling the board himself.
  await follow()
  await frame.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(frame).toHaveCount(0)
  await expect(status("Stopped following ann")).toHaveCount(1)
  await follow()
  await sam.page.mouse.move(sam.canvas.x + sam.canvas.width / 2, sam.canvas.y + sam.canvas.height / 2)
  await sam.page.mouse.wheel(0, 240)
  await expect(frame).toHaveCount(0)
  await expect(status("Stopped following ann")).toHaveCount(1)
  await ann.context.close()
  await sam.context.close()
})

test("on a computer, an empty board's map shows only the part of the board this screen shows", async ({ browser }) => {
  const sam = await open(browser, USERS.sam, farBoard([]), { scrollX: 0, scrollY: 0, zoom: 1 })
  await sam.page.getByRole("button", { name: "Board map", exact: true }).click()
  const map = sam.page.getByRole("application", { name: "Board map: press or drag to go there, or use the arrow keys" })
  await expect(map).toBeVisible()
  // With nothing drawn, the map is the screen's own outline, centred.
  const view = (await sam.page.locator("[data-board-map-view]").boundingBox())!
  const box = (await map.boundingBox())!
  expect(Math.abs(view.x + view.width / 2 - (box.x + box.width / 2))).toBeLessThan(2)
  expect(Math.abs(view.y + view.height / 2 - (box.y + box.height / 2))).toBeLessThan(2)
  await sam.context.close()
})

// On a phone the board is small enough to cross with a finger, and Excalidraw's phone layout has no zoom cluster (a
// pinch zooms), so there is no map; and a phone's board has no Board tools cluster (who's here, templates, AI,
// comments and share sit in a computer's top right), so Here now, Jump to and Follow are a computer's.
test("on a phone, the board has no map button and no Here now, and keeps its own button column", async ({ browser }) => {
  const sam = await open(browser, USERS.sam, farBoard(), { scrollX: 0, scrollY: 0, zoom: 1 }, PHONE)
  await expect(sam.page.locator(".mobile-misc-tools-container")).toBeVisible()
  await expect(sam.page.getByRole("button", { name: "Board map", exact: true })).toHaveCount(0)
  await expect(sam.page.getByRole("button", { name: /^Here now: / })).toHaveCount(0)
  await sam.context.close()
})
