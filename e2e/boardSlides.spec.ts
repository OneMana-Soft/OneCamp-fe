import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"
import { USERS, collabFor, fakeApp, setOffline, status } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { displayNameOf } from "../lib/personName"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"
import { footIsGutter, settled, topSheet } from "./sheetLayout"

// A board's frames as slides outside a call (miro-28): an editor's Present on a
// board with frames steps through them in the Frames panel's order (as the panel
// was just reordered), by Previous and Next, a clicker's keys and the outline;
// a viewer on another screen lands on the same slide, fitted to their own; Esc
// or End slides returns to the canvas. The outline's grid jumps to a slide, and
// Go to canvas leaves the slide while presenting goes on, until Back to slide.
// At 1280 the outline is a side panel beside the bar; at 390, with touch, a
// sheet with the bar pinned at its foot.

const BOARD = "b0a4d000-0000-4000-8000-0000000000f8"
const NAME = boardDocName(BOARD)
const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>
type Device = keyof typeof DEVICES

/** Three frames side by side, Intro, Q4 numbers and Plan, each round a note. */
function slideElements() {
  const elements: { id: string; x: number; y: number; width: number; height: number }[] = []
  const slides = [
    ["f-intro", "Intro", "Welcome"],
    ["f-q4", "Q4 numbers", "Revenue up 12%"],
    ["f-plan", "Plan", "Ship the slides"],
  ] as const
  slides.forEach(([id, name, text], i) => {
    const [card, label] = note(`n-${id}`, 100 + i * 600, 100, text)
    elements.push(frame(id, name, [card, label]), card, label)
  })
  return elements
}

/** The board on one collaboration server, for everyone who opens it: Sam and Ann edit, Vic views. */
function shareBoard(elements: unknown[] = slideElements()) {
  const levels: Record<string, string> = { sam: "edit", vic: "view", ann: "edit", guest: "view" }
  const board = { uuid: BOARD, title: "Q4 review", levels, update: boardDoc(ordered(elements)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels }]) }
}

async function open(browser: Browser, device: Device, on: ReturnType<typeof shareBoard>, user: typeof USERS.sam, theme: string, extra: [RegExp, unknown][] = []) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark" })
  await context.addInitScript(
    (key: string) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom: 1 }))
      } catch {
        /* the camera starts elsewhere, and the fit checks still hold */
      }
    },
    `onecamp:board:viewport:${BOARD}`,
  )
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab: on.collab, fixtures: [...extra, ...boardFixtures([on.board], user, USERS.sam)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { context, page, bar: page.getByRole("toolbar", { name: "Facilitation" }) }
}

/** The board's camera as the board keeps it (saved ~400 ms after it moves). */
const cameraOf = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null") as { scrollX: number; scrollY: number; zoom: number } | null, `onecamp:board:viewport:${BOARD}`)

/** The board's camera once it holds still: two reads 700 ms apart the same, so a follow still landing can't pass for one. */
async function stillCamera(page: Page) {
  let last = ""
  await expect.poll(async () => {
    const was = last
    last = JSON.stringify(await cameraOf(page))
    return last === was
  }, { message: "the camera holds still", intervals: [700], timeout: 15_000 }).toBe(true)
  return JSON.parse(last) as { scrollX: number; scrollY: number; zoom: number }
}

/** Tabs to `to` (at most 8 presses) and checks its ring shows, as it does when a keyboard reaches it (:focus-visible). */
async function tabTo(page: Page, to: Locator, what: string, key = "Tab") {
  for (let i = 0; i < 8 && !(await to.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press(key)
  await expect(to, `${key} reaches ${what}`).toBeFocused()
  expect(await to.evaluate((e) => e.matches(":focus-visible")), `${what}'s ring shows`).toBe(true)
}

/**
 * How the frame `id` sits on this screen, by the camera the board keeps: inside the canvas and clear of what's drawn
 * over it, the bars at its top and its foot (Excalidraw's tool row and phone footer, the board's clusters, the
 * facilitation bar, the slides' bar or a follower's "Slide 2 of 3") and a panel open beside it on a computer (the
 * outline), and whether it fills at least 80% of that room on the axis that binds.
 */
async function slideFit(page: Page, id: string) {
  const f = slideElements().find((e) => e.id === id)!
  return page.evaluate(
    ({ key, f }) => {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as { scrollX: number; scrollY: number; zoom: number } | null
      const canvas = document.querySelector(".excalidraw")?.getBoundingClientRect()
      if (!v || !canvas) return null
      const box = { left: canvas.left + (f.x + v.scrollX) * v.zoom, top: canvas.top + (f.y + v.scrollY) * v.zoom, width: f.width * v.zoom, height: f.height * v.zoom }
      let [top, bottom, left, right] = [canvas.top, canvas.bottom, canvas.left, canvas.right]
      const parts = "[data-board-slides], [data-facilitation], [role=toolbar][data-board-chrome], .App-toolbar, .App-bottom-bar > .Island, aside[data-board-chrome]"
      for (const part of document.querySelectorAll(parts)) {
        const r = part.getBoundingClientRect()
        if (r.height === 0 || r.bottom <= canvas.top || r.top >= canvas.bottom) continue
        if (part.tagName === "ASIDE") {
          if (r.left + r.width / 2 > canvas.left + canvas.width / 2) right = Math.min(right, r.left)
          else left = Math.max(left, r.right)
        } else if (r.top + r.height / 2 < canvas.top + canvas.height / 2) top = Math.max(top, r.bottom)
        else bottom = Math.min(bottom, r.top)
      }
      const inside = box.left >= left - 1 && box.left + box.width <= right + 1 && box.top >= top - 1 && box.top + box.height <= bottom + 1
      return { inside, fills: Math.max(box.width / (right - left), box.height / (bottom - top)) >= 0.8 }
    },
    { key: `onecamp:board:viewport:${BOARD}`, f },
  )
}
const expectOn = (page: Page, id: string, who: string) =>
  expect.poll(() => slideFit(page, id), { message: `${who} shows ${id} as a slide, whole and clear of the bars`, timeout: 10_000 }).toEqual({ inside: true, fills: true })

/**
 * Every control drawn on the board that covers the frame `id` on this screen, by the camera the board keeps: each
 * visible button, toolbar, group or island in the board's page, Excalidraw's and the board's own, named by what it
 * says. None, for a slide clear of them all.
 */
async function controlsOver(page: Page, id: string) {
  const f = slideElements().find((e) => e.id === id)!
  return page.evaluate(
    ({ key, f }) => {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as { scrollX: number; scrollY: number; zoom: number } | null
      const canvas = document.querySelector(".excalidraw")?.getBoundingClientRect()
      const board = document.querySelector("[data-board-page]")
      if (!v || !canvas || !board) return ["no board"]
      const [left, top] = [canvas.left + (f.x + v.scrollX) * v.zoom, canvas.top + (f.y + v.scrollY) * v.zoom]
      const [right, bottom] = [left + f.width * v.zoom, top + f.height * v.zoom]
      const over: string[] = []
      for (const el of board.querySelectorAll("button, [role=toolbar], [role=group], .Island, .mobile-misc-tools-container")) {
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.right <= left || r.left >= right || r.bottom <= top || r.top >= bottom) continue
        over.push(el.getAttribute("aria-label") || el.getAttribute("title") || el.className.toString() || el.tagName)
      }
      return over
    },
    { key: `onecamp:board:viewport:${BOARD}`, f },
  )
}
const expectClear = (page: Page, id: string, who: string) =>
  expect.poll(() => controlsOver(page, id), { message: `nothing drawn covers ${id} on ${who}'s screen`, timeout: 10_000 }).toEqual([])

/** Excalidraw's own editing chrome on a phone: the shape toolbar, the column of library, lock and hand, Undo and Redo. */
const PHONE_CHROME = [".App-toolbar--mobile", ".mobile-misc-tools-container", ".App-bottom-bar"]

/** The frame `id` and what's in it deleted on the server, as another editor deletes a frame, and sent to everyone. */
function deleteFrame(on: ReturnType<typeof shareBoard>, id: string) {
  on.collab.edit(NAME, (doc: { getMap: (name: string) => Map<string, Record<string, unknown>> }) => {
    const elements = doc.getMap("elements")
    for (const [key, el] of [...elements.entries()]) {
      if (key !== id && el.frameId !== id) continue
      elements.set(key, { ...el, isDeleted: true, version: Number(el.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() })
    }
  })
}

/** Opens the Frames panel: its button on a computer, Board options on a phone. */
async function openFrames(page: Page, device: Device) {
  if (device === "phone") {
    await page.getByRole("button", { name: "Board options" }).tap()
    await page.getByRole("menuitem", { name: "Frames" }).tap()
  } else {
    await page.getByRole("button", { name: "Frames", exact: true }).click()
  }
  return page.locator("[data-frames-panel]")
}

const tap = (device: Device) => (device === "phone" ? "tap" : "click") as "tap" | "click"

for (const device of ["computer", "phone"] as const) {
  for (const theme of SHOT_THEMES) {
    test(`Present steps through the frames in the Frames panel's order, with an outline, and a viewer follows (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const on = shareBoard()
      const sam = await open(browser, device, on, USERS.sam, theme)
      // The viewer watches from the other size of screen, so the slide is fitted to each.
      const vic = await open(browser, device === "phone" ? "computer" : "phone", on, USERS.vic, theme)
      const press = tap(device)

      // Plan moves to the top of the Frames panel (Alt with ↑, the grip's keys), and the board keeps that order.
      const panel = await openFrames(sam.page, device)
      const grip = panel.getByRole("button", { name: /^Move Plan/ })
      await grip.focus()
      await grip.press("Alt+ArrowUp")
      await grip.press("Alt+ArrowUp")
      await expect.poll(() => on.collab.doc(NAME).getMap("boardMeta").get("frameOrder")).toEqual(["f-plan", "f-intro", "f-q4"])
      if (device === "computer") await panel.getByRole("button", { name: "Close frames" }).click()
      else await sam.page.keyboard.press("Escape")
      await expect(panel).toHaveCount(0)
      const before = await cameraOf(sam.page)

      // Present: the first slide in the panel's order, fitted to the screen, and the viewer on it too.
      await sam.bar.getByRole("button", { name: "Present", exact: true })[press]()
      const slides = sam.page.locator("[data-board-slides]").getByRole("group", { name: "Slides" })
      await expect(slides.getByRole("button", { name: /^1 of 3 · Plan/ })).toBeVisible()
      await expectOn(sam.page, "f-plan", "the presenter")
      await expect(vic.page.getByRole("button", { name: "Slide 1 of 3, Plan: open the outline" })).toBeVisible()
      await expectOn(vic.page, "f-plan", "the viewer")
      // Nothing drawn on either screen covers the slide: no toolbar, island, group or button.
      await expectClear(sam.page, "f-plan", "the presenter")
      await expectClear(vic.page, "f-plan", "the viewer")
      if (device === "phone") {
        // On a phone the slide has the board to itself: Excalidraw's editing chrome steps away while the slides run,
        // and the board's own tools and the Presenting pill stay.
        for (const part of PHONE_CHROME) await expect(sam.page.locator(`.excalidraw ${part}`).first()).toBeHidden()
        await expect(sam.page.getByRole("toolbar", { name: "Board tools" })).toBeVisible()
        await expect(sam.bar).toContainText("Presenting")
      }
      await reviewShot(sam.page, "board-slides-present", theme)
      await reviewShot(vic.page, "board-slides-follower", theme)

      // Next and Previous, and the ends.
      await expect(slides.getByRole("button", { name: "Previous slide" })).toBeDisabled()
      await slides.getByRole("button", { name: "Next slide" })[press]()
      await expect(slides.getByRole("button", { name: /^2 of 3 · Intro/ })).toBeVisible()
      await expectOn(sam.page, "f-intro", "the presenter")
      await expectOn(vic.page, "f-intro", "the viewer")
      await slides.getByRole("button", { name: "Next slide" })[press]()
      await expect(slides.getByRole("button", { name: /^3 of 3 · Q4 numbers/ })).toBeVisible()
      await expect(slides.getByRole("button", { name: "Next slide" })).toBeDisabled()
      await expectOn(sam.page, "f-q4", "the presenter")
      await expectOn(vic.page, "f-q4", "the viewer")
      await slides.getByRole("button", { name: "Previous slide" })[press]()
      await expect(slides.getByRole("button", { name: /^2 of 3 · Intro/ })).toBeVisible()
      if (device === "phone") {
        // A note on the slide selected: its bar takes the slides' place, and the slides' bar rises one bar above it.
        await expectOn(sam.page, "f-intro", "the presenter")
        const dock = sam.page.locator("[data-board-slides]")
        const rest = (await dock.boundingBox())!
        const v = (await cameraOf(sam.page))!
        const c = (await sam.page.locator(".excalidraw").boundingBox())!
        const f = slideElements().find((e) => e.id === "f-intro")!
        const [cx, cy] = [c.x + (f.x + f.width / 2 + v.scrollX) * v.zoom, c.y + (f.y + f.height / 2 + v.scrollY) * v.zoom]
        await sam.page.touchscreen.tap(cx, cy)
        const notesBar = sam.page.locator("[data-notes-bar] [data-board-chrome]")
        await expect(notesBar).toBeVisible()
        await expect.poll(async () => {
          const [d, n] = [await dock.boundingBox(), await notesBar.boundingBox()]
          return !!d && !!n && d.y + d.height <= n.y
        }, { message: "the slides' bar sits above the note's" }).toBe(true)
        // Nothing selected (a tap beside the slide), and the slides' bar comes back down.
        await sam.page.touchscreen.tap(c.x + 6, cy)
        await expect(notesBar).toHaveCount(0)
        await expect.poll(async () => Math.round((await dock.boundingBox())!.y)).toBe(Math.round(rest.y))
      }
      if (device === "computer") {
        // A clicker's PageUp, and the arrows while nothing is selected.
        await sam.page.keyboard.press("PageUp")
        await expect(slides.getByRole("button", { name: /^1 of 3 · Plan/ })).toBeVisible()
        await sam.page.keyboard.press("ArrowRight")
        await expect(slides.getByRole("button", { name: /^2 of 3 · Intro/ })).toBeVisible()
      }

      // The outline: the deck in order, the slide that's up marked; a press jumps. On a computer, by keys: Enter on the
      // slide opens it, and Tab reaches its rows, ringed as they're focused.
      const opener = slides.getByRole("button", { name: /^2 of 3 · Intro/ })
      if (device === "computer") {
        await opener.focus()
        await sam.page.keyboard.press("Enter")
      } else await opener.tap()
      const outline = sam.page.locator("[data-slides-outline]")
      const list = outline.getByRole("list", { name: "Slides, in order" })
      await expect(list.getByRole("listitem")).toHaveText(["1Plan", "2Intro", "3Q4 numbers"])
      await expect(list.getByRole("button", { name: /Intro/ })).toHaveAttribute("aria-current", "step")
      for (const row of await list.getByRole("button").all()) expect((await row.boundingBox())!.height, "a row is 44 px to a finger").toBeGreaterThanOrEqual(device === "phone" ? 44 : 32)
      if (device === "phone") {
        // A sheet, with the bar pinned at its foot, as every phone sheet's foot stands (footIsGutter), read once it
        // has risen: read while it rose, the bar stood 43 px off the sheet's foot and a 44 px button measured 43.99.
        const sheet = sam.page.getByRole("dialog")
        await expect(sheet).toBeVisible()
        await settled(topSheet(sam.page))
        const foot = sheet.locator("[data-sheet-footer]").getByRole("group", { name: "Slides" })
        await expect(foot).toBeVisible()
        for (const name of ["Previous slide", "Next slide"]) expect((await foot.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await footIsGutter(topSheet(sam.page), "the slides' outline")
      } else {
        // A side panel beside the bar, clear of it.
        const panelBox = (await outline.boundingBox())!
        const barBox = (await slides.boundingBox())!
        expect(panelBox.x >= barBox.x + barBox.width || panelBox.y + panelBox.height <= barBox.y, "the outline sits beside the bar").toBe(true)
      }
      await reviewShot(sam.page, "board-slides-outline", theme)
      if (device === "computer") {
        const onRow = () => sam.page.evaluate(() => !!document.activeElement?.closest("[data-slides-outline] [data-slide-row]"))
        for (let i = 0; i < 40 && !(await onRow()); i++) await sam.page.keyboard.press("Tab")
        await expect.poll(onRow, { message: "Tab reaches the outline's rows" }).toBe(true)
        expect(await sam.page.evaluate(() => document.activeElement?.matches(":focus-visible")), "the row's ring shows").toBe(true)
        await reviewShot(sam.page, "board-slides-keyboard", theme)
      }
      await list.getByRole("button", { name: /Q4 numbers/ })[press]()
      await expect(sam.page.locator("[data-board-slides]").getByRole("button", { name: /^3 of 3 · Q4 numbers/ })).toBeVisible()
      await expectOn(sam.page, "f-q4", "the presenter")
      await expectOn(vic.page, "f-q4", "the viewer")

      // The viewer may open the outline to see where they are; it moves no one.
      const vicChip = vic.page.getByRole("button", { name: "Slide 3 of 3, Q4 numbers: open the outline" })
      await vicChip[device === "phone" ? "click" : "tap"]()
      const vicList = vic.page.locator("[data-slides-outline]").getByRole("list", { name: "Slides, in order" })
      await expect(vicList.getByRole("listitem")).toHaveText(["1Plan", "2Intro", "3Q4 numbers"])
      await expect(vicList.getByRole("button")).toHaveCount(0)
      await expect(vicList.locator('[aria-current="step"]')).toHaveText(/Q4 numbers/)
      // On a computer the outline is a panel beside the board, and the slide moves clear of it.
      if (device === "phone") await expectOn(vic.page, "f-q4", "the viewer, beside the outline,")
      await reviewShot(vic.page, "board-slides-follower-outline", theme)

      // Esc (a phone's End slides) returns to the canvas, where it was before Present; presenting goes on as today.
      if (device === "computer") await sam.page.locator("[data-slides-outline]").getByRole("button", { name: "Close slides" }).click()
      await expect(sam.page.locator("[data-slides-outline]")).toHaveCount(0)
      if (device === "computer") {
        // From the board itself: an empty spot beside the slide pressed, so the key starts at Excalidraw.
        const c = (await sam.page.locator(".excalidraw").boundingBox())!
        await sam.page.mouse.click(c.x + 24, c.y + c.height / 2)
        await expect.poll(() => sam.page.evaluate(() => !!document.activeElement?.closest(".excalidraw"))).toBe(true)
        await sam.page.keyboard.press("Escape")
      } else await sam.page.locator("[data-board-slides]").getByRole("button", { name: "End slides" }).tap()
      await expect(sam.page.locator("[data-board-slides]")).toHaveCount(0)
      await expect.poll(async () => {
        const now = await cameraOf(sam.page)
        return !!now && !!before && Math.abs(now.scrollX - before.scrollX) < 1 && Math.abs(now.scrollY - before.scrollY) < 1 && Math.abs(now.zoom - before.zoom) < 0.01
      }, { message: "the canvas is back where it was before the slides" }).toBe(true)
      await expect(sam.bar).toContainText(device === "phone" ? "Presenting" : "You're presenting")
      // A phone's editing chrome is back whole.
      if (device === "phone") for (const part of PHONE_CHROME) await expect(sam.page.locator(`.excalidraw ${part}`).first()).toBeVisible()
      await expect(vic.page.getByRole("button", { name: /^Slide \d of 3/ })).toHaveCount(0)
      await expect(vic.page.locator("[data-following]")).toContainText(`Following ${displayNameOf(USERS.sam)}`)
      await sam.context.close()
      await vic.context.close()
    })
  }
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of SHOT_THEMES) {
    test(`The outline's grid jumps to a slide, and Go to canvas leaves the slide while everyone follows, until Back to slide (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const on = shareBoard()
      const sam = await open(browser, device, on, USERS.sam, theme)
      const vic = await open(browser, device === "phone" ? "computer" : "phone", on, USERS.vic, theme)
      const press = tap(device)
      await sam.bar.getByRole("button", { name: "Present", exact: true })[press]()
      const dock = sam.page.locator("[data-board-slides]")
      const slides = dock.getByRole("group", { name: "Slides" })
      await expect(slides.getByRole("button", { name: /^1 of 3 · Intro/ })).toBeVisible()
      await expectOn(vic.page, "f-intro", "the viewer")

      // The grid, the outline's second view: every slide a tile, two to a row, with what its frame holds drawn small,
      // and the slide that's up marked.
      await slides.getByRole("button", { name: /^1 of 3 · Intro/ })[press]()
      const outline = sam.page.locator("[data-slides-outline]")
      await outline.getByRole("radio", { name: "Grid" })[press]()
      const grid = outline.locator("[data-slides-grid]")
      await expect(grid.getByRole("listitem")).toHaveText(["1Intro", "2Q4 numbers", "3Plan"])
      await expect(grid.getByRole("button", { name: /Intro/ })).toHaveAttribute("aria-current", "step")
      // A tile's name keeps a space between its number and its frame's name, though its text runs them together.
      await expect(grid.getByRole("button", { name: /Intro/ })).toHaveAccessibleName("1 Intro")
      // Each tile's drawing: the frame's paper and the note in it.
      for (const tile of await grid.locator("[data-slide-tile]").all()) await expect(tile.locator("svg rect")).toHaveCount(2)
      const at = await grid.getByRole("listitem").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)))
      expect(at[0], "two tiles to a row").toBe(at[1])
      expect(at[2], "the third on the next row").toBeGreaterThan(at[0])
      for (const tile of await grid.getByRole("button").all()) expect((await tile.boundingBox())!.height, "a tile is 44 px to a finger").toBeGreaterThanOrEqual(44)
      if (device === "phone") {
        // The outline's sheet, the bar pinned at its foot.
        await settled(topSheet(sam.page))
        await expect(sam.page.getByRole("dialog").locator("[data-sheet-footer]").getByRole("group", { name: "Slides" })).toBeVisible()
        await footIsGutter(topSheet(sam.page), "the slides' grid")
      }
      await reviewShot(sam.page, "board-slides-grid", theme)

      // A jump: on a computer by keys (the arrows move between tiles, Enter jumps), on a phone a tap, which closes the sheet.
      if (device === "computer") {
        // Shift+Tab from the first tile reaches the List | Grid control, ringed on its checked radio; Tab comes back.
        await grid.getByRole("button", { name: /Intro/ }).focus()
        await tabTo(sam.page, outline.getByRole("radio", { name: "Grid" }), "the List | Grid control", "Shift+Tab")
        await reviewShot(sam.page, "board-slides-view-keyboard", theme)
        await tabTo(sam.page, grid.getByRole("button", { name: /Intro/ }), "the first tile")
        await sam.page.keyboard.press("ArrowDown")
        await expect(grid.getByRole("button", { name: /Plan/ })).toBeFocused()
        // The focused tile has the ring; the slide that's up (Intro) has the tint and no ring: two marks of two kinds.
        expect(await grid.getByRole("button", { name: /Plan/ }).evaluate((e) => e.matches(":focus-visible")), "the tile's ring shows").toBe(true)
        const marks = (name: RegExp) =>
          grid.getByRole("button", { name }).evaluate((e) => {
            const s = getComputedStyle(e)
            return { ring: s.boxShadow !== "none", tint: s.backgroundColor !== "rgba(0, 0, 0, 0)" }
          })
        expect(await marks(/Plan/), "the focused tile: a ring and no tint").toEqual({ ring: true, tint: false })
        expect(await marks(/Intro/), "the slide that's up: a tint and no ring").toEqual({ ring: false, tint: true })
        await reviewShot(sam.page, "board-slides-grid-keyboard", theme)
        await sam.page.keyboard.press("ArrowLeft")
        await expect(grid.getByRole("button", { name: /Q4 numbers/ })).toBeFocused()
        await expect(slides.getByRole("button", { name: /^1 of 3 · Intro/ })).toBeVisible()
        await sam.page.keyboard.press("Enter")
      } else await grid.getByRole("button", { name: /Q4 numbers/ }).tap()
      await expect(slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeVisible()
      await expectOn(sam.page, "f-q4", "the presenter")
      await expectOn(vic.page, "f-q4", "the viewer")
      if (device === "computer") {
        await expect(grid.getByRole("button", { name: /Q4 numbers/ })).toHaveAttribute("aria-current", "step")
        // Esc closes the grid first; the slides go on.
        await sam.page.keyboard.press("Escape")
        await expect(outline).toHaveCount(0)
        await expect(slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeVisible()
        // By keys on the slide's bar: Go to canvas, then End slides, each ringed as it's focused.
        await slides.getByRole("button", { name: "Next slide" }).focus()
        await tabTo(sam.page, dock.getByRole("button", { name: "Go to canvas" }), "Go to canvas")
        await reviewShot(sam.page, "board-slides-bar-keyboard", theme)
        await tabTo(sam.page, dock.getByRole("button", { name: "End slides" }), "End slides")
        await reviewShot(sam.page, "board-slides-end-keyboard", theme)
      } else await expect(outline).toHaveCount(0)

      // The viewer's grid only shows where the deck is.
      const vicPress = device === "phone" ? "click" : "tap"
      await vic.page.getByRole("button", { name: "Slide 2 of 3, Q4 numbers: open the outline" })[vicPress]()
      const vicOutline = vic.page.locator("[data-slides-outline]")
      await vicOutline.getByRole("radio", { name: "Grid" })[vicPress]()
      const vicGrid = vicOutline.locator("[data-slides-grid]")
      await expect(vicGrid.getByRole("listitem")).toHaveCount(3)
      await expect(vicGrid.getByRole("button")).toHaveCount(0)
      await expect(vicGrid.locator('[aria-current="step"]')).toHaveText(/Q4 numbers/)
      if (device === "computer") await settled(topSheet(vic.page))
      await reviewShot(vic.page, "board-slides-follower-grid", theme)
      if (device === "phone") await vicOutline.getByRole("button", { name: "Close slides" }).click()
      else await vic.page.keyboard.press("Escape")
      await expect(vicOutline).toHaveCount(0)

      // Go to canvas: presenting goes on, the presenter has the canvas, and the viewer follows their view as plain Present.
      await dock.getByRole("button", { name: "Go to canvas" })[press]()
      const back = dock.getByRole("button", { name: "Back to slide 2" })
      await expect(back).toBeVisible()
      await expect(slides).toHaveCount(0)
      await expect(sam.bar).toContainText(device === "phone" ? "Presenting" : "You're presenting")
      await expect(vic.page.getByRole("button", { name: /^Slide \d of 3/ })).toHaveCount(0)
      await expect(vic.page.locator("[data-following]")).toContainText(`Following ${displayNameOf(USERS.sam)}`)
      if (device === "phone") for (const part of PHONE_CHROME) await expect(sam.page.locator(`.excalidraw ${part}`).first()).toBeVisible()
      else {
        // The presenter scrolls the canvas; the viewer's view goes with it, the presenter's way. Both cameras are read
        // once they hold still, so the follow still landing after Go to canvas can't pass for it.
        const samWas = await stillCamera(sam.page)
        const vicWas = await stillCamera(vic.page)
        const c = (await sam.page.locator(".excalidraw").boundingBox())!
        await sam.page.mouse.move(c.x + c.width / 2, c.y + c.height / 3)
        await sam.page.mouse.wheel(0, 400)
        await expect.poll(async () => (await cameraOf(sam.page))?.scrollY, { message: "the presenter's canvas scrolls" }).not.toBe(samWas.scrollY)
        const way = Math.sign((await stillCamera(sam.page)).scrollY - samWas.scrollY)
        await expect
          .poll(async () => Math.sign(((await cameraOf(vic.page))?.scrollY ?? vicWas.scrollY) - vicWas.scrollY), { message: "the viewer follows the presenter's view on the canvas, their way" })
          .toBe(way)
      }
      await reviewShot(sam.page, "board-slides-canvas", theme)
      if (device === "computer") {
        // By keys on the canvas's bar: Back to slide 2, ringed as it's focused.
        await dock.getByRole("button", { name: "End slides" }).focus()
        await tabTo(sam.page, back, "Back to slide 2", "Shift+Tab")
        await reviewShot(sam.page, "board-slides-back-keyboard", theme)
      }

      // Back to slide 2: the presenter and the viewer on it again, fitted.
      await back[press]()
      await expect(slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeVisible()
      await expectOn(sam.page, "f-q4", "the presenter")
      await expect(vic.page.getByRole("button", { name: "Slide 2 of 3, Q4 numbers: open the outline" })).toBeVisible()
      await expectOn(vic.page, "f-q4", "the viewer")

      // One press ends the slides entirely, from the canvas too; presenting goes on.
      await dock.getByRole("button", { name: "Go to canvas" })[press]()
      await dock.getByRole("button", { name: "End slides" })[press]()
      await expect(dock).toHaveCount(0)
      await expect(sam.bar).toContainText(device === "phone" ? "Presenting" : "You're presenting")
      await sam.context.close()
      await vic.context.close()
    })
  }
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of SHOT_THEMES) {
    test(`Present on a board with no frames is as today, and its outline says how to add a frame (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(120_000)
      const on = shareBoard([...note("n-a", 100, 100, "Just a note")])
      const sam = await open(browser, device, on, USERS.sam, theme)
      await sam.bar.getByRole("button", { name: "Present", exact: true })[tap(device)]()
      await expect(sam.bar).toContainText(device === "phone" ? "Presenting" : "You're presenting")
      await expect(sam.page.locator("[data-board-slides]")).toHaveCount(0)
      // A phone's editing chrome stays: there are no slides to run.
      if (device === "phone") {
        for (const part of PHONE_CHROME) await expect(sam.page.locator(`.excalidraw ${part}`).first()).toBeVisible()
        await sam.bar.getByRole("button", { name: "Facilitation options" }).tap()
        await sam.page.getByRole("menuitem", { name: "Slides" }).tap()
      } else await sam.bar.getByRole("button", { name: "Slides", exact: true }).click()
      const outline = sam.page.locator("[data-slides-outline]")
      await expect(outline.getByText("No frames yet")).toBeVisible()
      await expect(outline.getByText(/Add a frame/)).toBeVisible()
      // The F key only where there are keys: on a touch screen the sheet says to add one from the Frames panel.
      if (device === "phone") await expect(outline).not.toContainText("with F")
      else await expect(outline.getByText(/or draw one with F/)).toBeVisible()
      // On a phone, the sheet, read once it has risen.
      if (device === "phone") await settled(topSheet(sam.page))
      await reviewShot(sam.page, "board-slides-empty", theme)
      await sam.context.close()
    })
  }
}

for (const theme of SHOT_THEMES) {
  test(`A phone editor following the slides has the board to itself, and its tools come back on End slides and on Stop following (${theme})`, async ({ browser }) => {
    test.setTimeout(180_000)
    const on = shareBoard()
    const sam = await open(browser, "computer", on, USERS.sam, theme)
    const ann = await open(browser, "phone", on, USERS.ann, theme)
    const chrome = (shown: boolean) => Promise.all(PHONE_CHROME.map((part) => expect(ann.page.locator(`.excalidraw ${part}`).first())[shown ? "toBeVisible" : "toBeHidden"]()))
    await chrome(true)

    // Sam presents; Ann, who could draw, follows on her phone: the slide has her board to itself, nothing drawn over it.
    await sam.bar.getByRole("button", { name: "Present", exact: true }).click()
    await expect(ann.page.getByRole("button", { name: "Slide 1 of 3, Intro: open the outline" })).toBeVisible()
    await expectOn(ann.page, "f-intro", "the editor following")
    await expectClear(ann.page, "f-intro", "the editor following")
    await chrome(false)
    await reviewShot(ann.page, "board-slides-editor-following", theme)

    // End slides: her tools come back whole.
    await sam.page.locator("[data-board-slides]").getByRole("button", { name: "End slides" }).click()
    await expect(ann.page.getByRole("button", { name: /^Slide \d of 3/ })).toHaveCount(0)
    await chrome(true)
    await reviewShot(ann.page, "board-slides-editor-back", theme)

    // Sam picks a slide from the outline: they step away again; Stop following brings them back whole.
    await sam.bar.getByRole("button", { name: "Slides", exact: true }).click()
    await sam.page.locator("[data-slides-outline]").getByRole("button", { name: /Q4 numbers/ }).click()
    await expect(ann.page.getByRole("button", { name: "Slide 2 of 3, Q4 numbers: open the outline" })).toBeVisible()
    await expectClear(ann.page, "f-q4", "the editor following")
    await chrome(false)
    await ann.bar.getByRole("button", { name: "Facilitation options" }).tap()
    await ann.page.getByRole("menuitem", { name: "Stop following" }).tap()
    await expect(ann.page.getByRole("button", { name: /^Slide \d of 3/ })).toHaveCount(0)
    await chrome(true)
    await sam.context.close()
    await ann.context.close()
  })
}

test("The slide's frame deleted while it's up: the deck goes to the frame in its place, and with none left the slides end", async ({ browser }) => {
  test.setTimeout(180_000)
  const on = shareBoard()
  const sam = await open(browser, "computer", on, USERS.sam, "light")
  const vic = await open(browser, "phone", on, USERS.vic, "light")
  const before = await cameraOf(sam.page)
  await sam.bar.getByRole("button", { name: "Present", exact: true }).click()
  const slides = sam.page.locator("[data-board-slides]").getByRole("group", { name: "Slides" })
  await expect(slides.getByRole("button", { name: /^1 of 3 · Intro/ })).toBeVisible()
  await slides.getByRole("button", { name: "Next slide" }).click()
  await expect(slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeVisible()
  await expectOn(vic.page, "f-q4", "the viewer")

  // Another editor deletes the frame that's up: the frame that took its place in the panel's order, the next, comes
  // up, for everyone following too.
  deleteFrame(on, "f-q4")
  await expect(slides.getByRole("button", { name: /^2 of 2 · Plan/ })).toBeVisible()
  await expectOn(sam.page, "f-plan", "the presenter")
  await expect(vic.page.getByRole("button", { name: "Slide 2 of 2, Plan: open the outline" })).toBeVisible()
  await expectOn(vic.page, "f-plan", "the viewer")

  // The last one deleted: the one before it.
  deleteFrame(on, "f-plan")
  await expect(slides.getByRole("button", { name: /^1 of 1 · Intro/ })).toBeVisible()
  await expectOn(sam.page, "f-intro", "the presenter")
  await expectOn(vic.page, "f-intro", "the viewer")

  // None left: the slides end as End slides ends them, the canvas where it was before them; presenting goes on.
  deleteFrame(on, "f-intro")
  await expect(sam.page.locator("[data-board-slides]")).toHaveCount(0)
  await expect.poll(async () => {
    const now = await cameraOf(sam.page)
    return !!now && !!before && Math.abs(now.scrollX - before.scrollX) < 1 && Math.abs(now.scrollY - before.scrollY) < 1 && Math.abs(now.zoom - before.zoom) < 0.01
  }, { message: "the canvas is back where it was before the slides" }).toBe(true)
  await expect(sam.bar).toContainText("You're presenting")
  await expect(vic.page.getByRole("button", { name: /^Slide \d of/ })).toHaveCount(0)
  await sam.context.close()
  await vic.context.close()
})

// Presenter notes (miro-28 2a): Sam, an editor, writes a frame's notes from its row in the Frames panel (a popover at
// 1280, a drawer at 390), and a save over notes Ann changed meanwhile says "Someone else changed these notes" and keeps
// Sam's text until Save mine. Presenting, Sam sees the slide's notes (the outline's foot at 1280, a drawer from the bar
// at 390); Vic, following, and a share link's guest see none and never ask for them.
type Note = { frame_id: string; body: string; version: number }
function notesServer() {
  const notes = new Map<string, Note>([["f-intro", { frame_id: "f-intro", body: "Open with the numbers", version: 2 }]])
  const asked: string[] = []
  const fixtures = (who: string): [RegExp, unknown][] => [
    [new RegExp(`/board/getFrameNotes/${BOARD}$`), () => (asked.push(who), { msg: "ok", data: [...notes.values()] })],
    [
      /\/board\/saveFrameNote$/,
      (_path: string, _url: URL, req: { postDataJSON(): Note }) => {
        const b = req.postDataJSON()
        const now = notes.get(b.frame_id)
        if ((now?.version ?? 0) !== b.version) return status(409, { code: "stale_note", msg: "These notes changed", data: now ?? null })
        const next = { frame_id: b.frame_id, body: b.body, version: (now?.version ?? 0) + 1 }
        notes.set(b.frame_id, next)
        return { msg: "ok", data: next }
      },
    ],
  ]
  return { notes, asked, fixtures }
}

const GUEST_TOKEN = "guest-link-q4-review"
async function openGuest(browser: Browser, device: Device, on: ReturnType<typeof shareBoard>, theme: string, extra: [RegExp, unknown][]) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme as "light" | "dark" })
  const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Q4 review", workspace_name: "Acme" }
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: on.collab, fixtures: [...extra, [new RegExp(`/guest/collab/${GUEST_TOKEN}$`), { msg: "ok", data: session }]] })
  const page = await context.newPage()
  await page.goto(`/guest/b/${GUEST_TOKEN}`)
  await expect(page.locator("[data-guest-board]")).toBeAttached({ timeout: 30_000 })
  return { context, page }
}

for (const device of ["computer", "phone"] as const) {
  for (const theme of SHOT_THEMES) {
    test(`The presenter sees each slide's notes, written from the Frames panel; a follower and a guest never ask (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const on = shareBoard()
      const server = notesServer()
      const sam = await open(browser, device, on, USERS.sam, theme, server.fixtures("sam"))
      const vic = await open(browser, device, on, USERS.vic, theme, server.fixtures("vic"))
      const guest = await openGuest(browser, device, on, theme, server.fixtures("guest"))
      const press = tap(device)

      // Sam writes Q4 numbers' notes from its row.
      const panel = await openFrames(sam.page, device)
      await panel.getByRole("button", { name: "Add notes for Q4 numbers" })[press]()
      const field = sam.page.getByRole("textbox", { name: "Presenter notes" })
      await field.fill("Revenue first, then costs")
      await sam.page.getByRole("button", { name: "Save notes" })[press]()
      await expect(sam.page.getByText("Saved", { exact: true })).toBeVisible()
      await expect.poll(() => server.notes.get("f-q4")?.body).toBe("Revenue first, then costs")
      await reviewShot(sam.page, "board-notes-row", theme)
      await sam.page.keyboard.press("Escape")
      await expect(field).toHaveCount(0)

      // Ann changes Intro's notes meanwhile: Sam's save over them is refused, says so, and keeps Sam's text.
      await panel.getByRole("button", { name: "Notes for Intro" })[press]()
      await expect(field).toHaveValue("Open with the numbers")
      server.notes.set("f-intro", { frame_id: "f-intro", body: "Ann: thank the team first", version: 3 })
      await field.fill("Open with the numbers, then the demo")
      await sam.page.getByRole("button", { name: "Save notes" })[press]()
      const alert = sam.page.getByRole("alert").filter({ hasText: "Someone else changed these notes" })
      await expect(alert).toBeVisible()
      await expect(alert).toContainText("Ann: thank the team first")
      await expect(field).toHaveValue("Open with the numbers, then the demo")
      // Its two choices are the only actions (one primary); on a phone in the drawer's pinned footer, 44 px (DB-133 F3).
      await expect(sam.page.getByRole("button", { name: "Save notes" })).toHaveCount(0)
      if (device === "phone") {
        const foot = sam.page.locator("[data-sheet-footer]").last()
        await expect(foot.getByRole("button")).toHaveText(["Use theirs", "Save mine"])
        expect((await foot.getByRole("button", { name: "Save mine" }).boundingBox())?.height, "the foot's buttons are 44 px").toBe(44)
      }
      await reviewShot(sam.page, "board-notes-stale", theme)
      await sam.page.getByRole("button", { name: "Save mine" })[press]()
      await expect.poll(() => server.notes.get("f-intro")).toEqual({ frame_id: "f-intro", body: "Open with the numbers, then the demo", version: 4 })
      await sam.page.keyboard.press("Escape")
      await expect(field).toHaveCount(0)
      if (device === "computer") await panel.getByRole("button", { name: "Close frames" }).click()
      else await sam.page.keyboard.press("Escape")
      await expect(panel).toHaveCount(0)

      // Presenting, Sam sees the slide's notes; on Next, the next slide's.
      await sam.bar.getByRole("button", { name: "Present", exact: true })[press]()
      const slides = sam.page.locator("[data-board-slides]").getByRole("group", { name: "Slides" })
      await expect(slides.getByRole("button", { name: /^1 of 3 · Intro/ })).toBeVisible()
      const notes = sam.page.getByRole("region", { name: "Notes for this slide" })
      if (device === "computer") await slides.getByRole("button", { name: /^1 of 3 · Intro/ }).click()
      else await sam.page.getByRole("button", { name: "Notes for this slide" }).tap()
      await expect(notes).toContainText("Open with the numbers, then the demo")
      await reviewShot(sam.page, "board-notes-presenter", theme)
      if (device === "phone") {
        // From Notes in the Presenting pill: the drawer named for the slide, Edit in its pinned footer (DB-133 F1, F3).
        await expect(sam.page.getByText("Notes for Intro", { exact: true })).toBeVisible()
        const foot = sam.page.locator("[data-sheet-footer]").last()
        await expect(foot.getByRole("button")).toHaveText(["Edit"])
        expect((await foot.getByRole("button", { name: "Edit" }).boundingBox())?.height, "the foot's button is 44 px").toBe(44)
        await sam.page.keyboard.press("Escape")
        await expect(notes).toHaveCount(0)
      }
      await slides.getByRole("button", { name: "Next slide" })[press]()
      const q4 = slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })
      await expect(q4).toBeVisible()
      // The slide's name whole in the bar, at 390 with touch too (DB-133 F2).
      expect(await q4.locator("span").evaluate((e) => e.scrollWidth <= e.clientWidth), "the slide's name is whole").toBe(true)
      await reviewShot(sam.page, "board-notes-present-name", theme)
      if (device === "computer") await expect(notes).toContainText("Revenue first, then costs")

      // Vic follows and the guest is taken along: neither sees notes, and neither ever asked for them.
      await expect(vic.page.getByRole("button", { name: /^Slide \d of 3, .*: open the outline$/ })).toBeVisible({ timeout: 10_000 })
      await vic.page.getByRole("button", { name: /^Slide \d of 3, .*: open the outline$/ })[press]()
      await expect(vic.page.locator("[data-slides-outline]")).toBeVisible()
      await expect(vic.page.getByRole("region", { name: "Notes for this slide" })).toHaveCount(0)
      await expect(vic.page.getByRole("button", { name: "Notes for this slide" })).toHaveCount(0)
      await expect(guest.page.getByRole("button", { name: /^Slide \d of 3, .*: open the outline$/ })).toBeVisible({ timeout: 10_000 })
      await expect(guest.page.getByRole("region", { name: "Notes for this slide" })).toHaveCount(0)
      expect(server.asked.filter((who) => who !== "sam")).toEqual([])
      expect(server.asked).toContain("sam")
      await Promise.all([sam.context.close(), vic.context.close(), guest.context.close()])
    })
  }
}

// Presenter notes' states and keys (DB-133 F4, F5), each a named frame at 1280 and 390 with touch, light and dark: the
// notes offline while they wait, loading, a failed read with Try again, the count near the cap, a row with notes (a
// tinted chip) beside one without, a long note at the presenter's foot or in its drawer, and an empty slide. At 1280
// the keys: Tab to a row's Notes (its ring), Enter opens the editor focused, Escape gives the row's Notes the focus
// back, a stale save leaves the focus on Save mine (in Save notes' place), and the presenter's Cancel goes back to Edit.
for (const device of ["computer", "phone"] as const) {
  for (const theme of SHOT_THEMES) {
    test(`Presenter notes' states and keys: offline, loading, a failed read, the cap, rows with and without, a long note, empty (${device}, ${theme})`, async ({ browser }) => {
      test.setTimeout(180_000)
      const on = shareBoard()
      const server = notesServer()
      const long = Array.from({ length: 24 }, (_, i) => `Point ${i + 1}: say it plainly`).join("\n")
      server.notes.set("f-q4", { frame_id: "f-q4", body: long, version: 1 })
      const sam = await open(browser, device, on, USERS.sam, theme, server.fixtures("sam"))
      const press = tap(device)
      const ring = (l: Locator) => l.evaluate((e) => e.matches(":focus-visible") && getComputedStyle(e).boxShadow !== "none")
      // The first read held, then failed: offline while it waits, loading once back, then Try again.
      let release: (ok: boolean) => void = () => {}
      const held = new Promise<boolean>((r) => (release = r))
      await sam.page.route(new RegExp(`/board/getFrameNotes/${BOARD}$`), async (route) => ((await held) ? route.fallback() : route.fulfill({ status: 500, json: { msg: "The notes are down" } })), { times: 1 })
      const panel = await openFrames(sam.page, device)
      await setOffline(sam.context, true)
      await panel.getByRole("button", { name: "Add notes for Plan" })[press]()
      await expect(sam.page.getByText("You're offline: the notes load when you're back.")).toBeVisible()
      await reviewShot(sam.page, "board-notes-offline-wait", theme)
      await setOffline(sam.context, false)
      await expect(sam.page.getByRole("status", { name: "Loading the notes" })).toBeVisible()
      await reviewShot(sam.page, "board-notes-loading", theme)
      release(false)
      await expect(sam.page.getByText("Couldn't load the notes")).toBeVisible()
      await reviewShot(sam.page, "board-notes-error", theme)
      await sam.page.getByRole("button", { name: "Try again" })[press]()
      const field = sam.page.getByRole("textbox", { name: "Presenter notes" })
      await expect(field).toBeVisible()
      await field.fill("x".repeat(8_123))
      await expect(sam.page.getByText("8,123 of 10,000", { exact: true })).toBeVisible()
      await reviewShot(sam.page, "board-notes-cap", theme)
      // Offline after a save (the request never leaves; the fake app's routes would answer an offline context): the
      // text is kept.
      await sam.page.route(/\/board\/saveFrameNote$/, (route) => route.abort("internetdisconnected"), { times: 1 })
      await sam.page.getByRole("button", { name: "Save notes" })[press]()
      await expect(sam.page.getByRole("alert").filter({ hasText: "You're offline" })).toContainText("Your text is kept here")
      await expect(field).toHaveValue("x".repeat(8_123))
      await reviewShot(sam.page, "board-notes-offline-save", theme)
      await sam.page.keyboard.press("Escape")
      await expect(field).toHaveCount(0)
      // A row with notes (Intro: the tinted chip) beside one without (Plan).
      await expect(panel.getByRole("button", { name: "Notes for Intro" })).toHaveAttribute("data-has-notes", "")
      await reviewShot(sam.page, "board-notes-rows", theme)
      if (device === "computer") {
        await panel.getByRole("listitem").filter({ hasText: "Plan" }).hover()
        await reviewShot(sam.page, "board-notes-rows-hover", theme)
        // Keys: Tab to Plan's Notes (shown on focus, its ring whole), Enter opens the editor focused, Escape gives it back.
        const plan = panel.getByRole("button", { name: "Add notes for Plan" })
        await panel.getByRole("button", { name: /^Move Plan/ }).focus()
        for (let i = 0; i < 4 && !(await plan.evaluate((e) => e === document.activeElement)); i++) await sam.page.keyboard.press("Tab")
        await expect(plan).toBeFocused()
        expect(await ring(plan), "Plan's Notes has its ring").toBe(true)
        await reviewShot(sam.page, "board-notes-key-row", theme)
        await sam.page.keyboard.press("Enter")
        await expect(field).toBeFocused()
        await reviewShot(sam.page, "board-notes-key-editor", theme)
        await sam.page.keyboard.press("Escape")
        await expect(plan).toBeFocused()
        // A stale save by keys: the focus stays on Save mine, in Save notes' place.
        await panel.getByRole("button", { name: "Notes for Intro" }).focus()
        await sam.page.keyboard.press("Enter")
        server.notes.set("f-intro", { frame_id: "f-intro", body: "Ann's words", version: 3 })
        await field.fill("Mine")
        await sam.page.keyboard.press("Tab")
        await expect(sam.page.getByRole("button", { name: "Save notes" })).toBeFocused()
        await sam.page.keyboard.press("Enter")
        await expect(sam.page.getByRole("alert").filter({ hasText: "Someone else changed these notes" })).toBeVisible()
        await expect(sam.page.getByRole("button", { name: "Save mine" })).toBeFocused()
        await reviewShot(sam.page, "board-notes-key-stale", theme)
        await sam.page.keyboard.press("Escape")
        await panel.getByRole("button", { name: "Close frames" }).click()
      } else await sam.page.keyboard.press("Escape")
      await expect(panel).toHaveCount(0)
      // Presenting: a long note scrolls in its own box; Plan's empty foot or drawer.
      await sam.bar.getByRole("button", { name: "Present", exact: true })[press]()
      const slides = sam.page.locator("[data-board-slides]").getByRole("group", { name: "Slides" })
      await slides.getByRole("button", { name: "Next slide" })[press]()
      await expect(slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeVisible()
      const notes = sam.page.getByRole("region", { name: "Notes for this slide" })
      const pill = sam.page.getByRole("button", { name: "Notes for this slide" })
      if (device === "computer") await slides.getByRole("button", { name: /^2 of 3 · Q4 numbers/ }).click()
      else await pill.tap()
      const text = notes.getByText(/^Point 1: say it plainly/)
      await expect(text).toBeVisible()
      expect(await text.evaluate((e) => e.scrollHeight > e.clientHeight), "a long note scrolls in its own box").toBe(true)
      await reviewShot(sam.page, "board-notes-long", theme)
      if (device === "phone") await sam.page.keyboard.press("Escape")
      await slides.getByRole("button", { name: "Next slide" })[press]()
      await expect(slides.getByRole("button", { name: /^3 of 3 · Plan/ })).toBeVisible()
      if (device === "phone") await pill.tap()
      await expect(notes).toContainText("No notes for this slide")
      const add = device === "phone" ? sam.page.locator("[data-sheet-footer]").last().getByRole("button", { name: "Add notes" }) : notes.getByRole("button", { name: "Add notes" })
      await expect(add).toBeVisible()
      await reviewShot(sam.page, "board-notes-empty", theme)
      if (device === "computer") {
        // The presenter's Add notes has its ring; Cancel gives it the focus back.
        await add.focus()
        await sam.page.keyboard.press("Tab")
        await sam.page.keyboard.press("Shift+Tab")
        expect(await ring(add), "Add notes has its ring").toBe(true)
        await reviewShot(sam.page, "board-notes-key-add", theme)
        await sam.page.keyboard.press("Enter")
        await expect(notes.getByRole("textbox", { name: "Presenter notes" })).toBeFocused()
        await notes.getByRole("button", { name: "Cancel" }).click()
        await expect(add).toBeFocused()
      }
      await sam.context.close()
    })
  }
}
