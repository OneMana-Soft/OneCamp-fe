import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"
import * as Y from "yjs"
import { CONTAINER, PHONE_FOOTER, TOOL_ROW, ZOOM_CLUSTER } from "../components/board/excalidrawPart"
import { boardDoc, frame, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"
import { CollabRelay } from "./docs/collabRelay"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// Slides control (meet-14, Meet's slide controls): the board on a call's stage
// moves through its frames for everyone. The call connects to a fake call
// server (fakeCallServer), so the room's metadata names the slide as Call
// Control writes it (board.slide); the board's drawing comes from a
// collaboration server in the test (CollabRelay), three named frames. A
// mover's presses reach Call Control as board_slide, and everyone's camera
// goes to the room's slide: the stage marks the frame it was put on
// (data-slide-placed).
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000cd"
const SID = "5e550000-0000-4000-8000-0000000000ad"
const BOARD = "b0a4d000-0000-4000-8000-000000000004"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }

/** The board: three frames side by side, Intro, Q4 numbers and Plan, each round a note. */
/** The deck's scene: three named frames, each round a note. */
function slideElements(): unknown[] {
  const elements: unknown[] = []
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
function slidesBoard(): Uint8Array {
  return boardDoc(ordered(slideElements()))
}

/** Joins a channel's call whose room has `board` on the stage; `acts` gets what reaches Call Control. */
async function joinWithBoard(page: Page, testInfo: TestInfo, board: Record<string, unknown>) {
  const acts: unknown[] = []
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    // The board on the stage opens its collaboration session with a token of the member's own.
    "/auth/token": { data: { token: "e2e-sam" } },
    [`/calls/${SID}/act`]: (_url: URL, request: Request) => {
      acts.push(request.postDataJSON())
      return { msg: "ok", data: { affected: 1 } }
    },
  })
  const relay = new CollabRelay()
  Y.applyUpdate(relay.doc(`board:${BOARD}`), slidesBoard())
  await relay.attach(page, YOU.name)
  const server = await fakeCallServer(page, { you: YOU, others: [PRIYA], metadata: { board } })
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  const stage = page.locator(`[data-call-board="${BOARD}"]`)
  await expect(stage.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  return { server, acts, stage }
}
/** A review shot in each theme the run takes (SHOTS_DIR), back in light after. */
async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}
const lastAct = (acts: unknown[]) => () => acts.at(-1)

/**
 * How the slide `id` sits on the stage (DESIGN-BUILD-63's MUST, 31 Oct: a slide
 * fills the stage, as Meet's presented slide and Miro's presentation mode do):
 * its frame's box on screen, from the camera the board keeps as it moves
 * (BoardCanvas saves it), inside the canvas and clear of what's drawn over it
 * (the board's bar, Excalidraw's tool row, phone footer and zoom cluster), and
 * how much of the room left free it covers, the way it binds.
 */
async function slideFit(page: Page, id: string) {
  const f = slideElements().find((e) => (e as { id: string }).id === id) as { x: number; y: number; width: number; height: number }
  const over = ['[data-board-bar="overlay"]', TOOL_ROW, PHONE_FOOTER, ZOOM_CLUSTER].join(", ")
  return page.evaluate(
    ({ key, board, f, canvasPart, over }) => {
      const v = JSON.parse(localStorage.getItem(key) ?? "null") as { scrollX: number; scrollY: number; zoom: number } | null
      const host = document.querySelector(`[data-call-board="${board}"]`)
      const canvas = host?.querySelector(canvasPart)?.getBoundingClientRect()
      if (!v || !host || !canvas) return null
      const box = { left: canvas.left + (f.x + v.scrollX) * v.zoom, top: canvas.top + (f.y + v.scrollY) * v.zoom, width: f.width * v.zoom, height: f.height * v.zoom }
      let top = canvas.top
      let bottom = canvas.bottom
      for (const part of host.querySelectorAll(over)) {
        const r = part.getBoundingClientRect()
        if (r.height === 0 || r.bottom <= canvas.top || r.top >= canvas.bottom) continue
        if (r.top + r.height / 2 < canvas.top + canvas.height / 2) top = Math.max(top, r.bottom)
        else bottom = Math.min(bottom, r.top)
      }
      const inside = box.left >= canvas.left - 1 && box.left + box.width <= canvas.right + 1 && box.top >= top - 1 && box.top + box.height <= bottom + 1
      const cover = Math.max(box.width / canvas.width, box.height / (bottom - top))
      return { inside, fills: cover >= 0.85, cover: Math.round(cover * 100) / 100 }
    },
    { key: `onecamp:board:viewport:${BOARD}`, board: BOARD, f, canvasPart: CONTAINER, over },
  )
}
/** The slide `id` covers at least 85% of the stage's free room, inside it and clear of its bars. */
const expectFills = (page: Page, id: string) =>
  expect.poll(() => slideFit(page, id), { message: `slide ${id} fills the stage, clear of its bars`, timeout: 10_000 }).toMatchObject({ inside: true, fills: true })

test.describe("at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("its presenter moves everyone through the board's frames by button, by a clicker's key and by the list", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const live = { uuid: BOARD, by: YOU.identity, draw: "everyone", slide: "f-intro" }
    const { server, acts, stage } = await joinWithBoard(page, testInfo, live)
    await expect(stage).toHaveAttribute("data-slide-placed", "f-intro", { timeout: 30_000 })
    const slides = page.getByRole("toolbar", { name: "Board controls" }).getByRole("group", { name: "Slides" })
    await expect(slides.getByRole("button", { name: "1 of 3 · Intro" })).toBeVisible()
    await expect(slides.getByRole("button", { name: "Previous slide" })).toBeDisabled()
    await expectFills(page, "f-intro")
    await shots(page, "slides-presenter")

    await slides.getByRole("button", { name: "Next slide" }).click()
    await expect.poll(lastAct(acts)).toEqual({ action: "board_slide", slide: "f-q4" })
    // Call Control writes the slide into the room, and the camera goes there.
    server.setMetadata({ board: { ...live, slide: "f-q4" } })
    await expect(stage).toHaveAttribute("data-slide-placed", "f-q4")
    await expect(slides.getByRole("button", { name: "2 of 3 · Q4 numbers" })).toBeVisible()

    // A presenter's clicker sends PageDown, wherever the focus is but a field.
    await page.keyboard.press("PageDown")
    await expect.poll(lastAct(acts)).toEqual({ action: "board_slide", slide: "f-plan" })
    server.setMetadata({ board: { ...live, slide: "f-plan" } })
    await expect(stage).toHaveAttribute("data-slide-placed", "f-plan")
    await expect(slides.getByRole("button", { name: "Next slide" })).toBeDisabled()

    await slides.getByRole("button", { name: "3 of 3 · Plan" }).click()
    await expect(page.getByRole("menuitemradio")).toHaveText(["Whole board", "1Intro", "2Q4 numbers", "3Plan"])
    await expect(page.getByRole("menuitemradio", { name: "3 Plan" })).toHaveAttribute("aria-checked", "true")
    await shots(page, "slides-list")
    await page.getByRole("menuitemradio", { name: "Whole board" }).click()
    await expect.poll(lastAct(acts)).toEqual({ action: "board_slide", slide: "" })
    server.setMetadata({ board: { ...live, slide: undefined } })
    await expect(stage).toHaveAttribute("data-slide-placed", "")
    await expect(slides.getByRole("button", { name: "Whole board" })).toBeVisible()
  })

  test("everyone else's camera follows the room's slide, and they see which it is but can't move it", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const live = { uuid: BOARD, by: PRIYA.identity, draw: "everyone", slide: "f-q4" }
    const { server, acts, stage } = await joinWithBoard(page, testInfo, live)
    await expect(stage).toHaveAttribute("data-slide-placed", "f-q4", { timeout: 30_000 })
    await expect(page.getByRole("button", { name: "Slide 2 of 3, Q4 numbers: show it again" })).toBeVisible()
    await expect(page.getByRole("group", { name: "Slides" })).toHaveCount(0)
    await expectFills(page, "f-q4")
    await shots(page, "slides-viewer")
    server.setMetadata({ board: { ...live, slide: "f-plan" } })
    await expect(stage).toHaveAttribute("data-slide-placed", "f-plan")
    await page.getByRole("button", { name: "Slide 3 of 3, Plan: show it again" }).click()
    await page.keyboard.press("PageDown")
    await page.waitForTimeout(300)
    expect(acts).toEqual([])
  })
})

test.describe("at 390 with touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("its presenter taps through the slides, and shows the whole board from the sheet", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const live = { uuid: BOARD, by: YOU.identity, draw: "everyone", slide: "f-q4" }
    const { acts, stage } = await joinWithBoard(page, testInfo, live)
    await expect(stage).toHaveAttribute("data-slide-placed", "f-q4", { timeout: 30_000 })
    const slides = page.getByRole("group", { name: "Slides" })
    await expect(slides).toBeVisible()
    // Its buttons take a finger each: no reach covers a neighbour's.
    expect(overlapping(await reachesIn(page, '[role="group"][aria-label="Slides"]'))).toEqual([])
    // The board's bar keeps to the screen.
    for (const box of await page.locator("[data-board-bar] button").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right))) {
      expect(box).toBeLessThanOrEqual(390)
    }
    await expectFills(page, "f-q4")
    await shots(page, "slides-presenter-phone")

    await slides.getByRole("button", { name: "Next slide" }).tap()
    await expect.poll(lastAct(acts)).toEqual({ action: "board_slide", slide: "f-plan" })
    await slides.getByRole("button", { name: "2 of 3 · Q4 numbers" }).tap()
    const whole = page.getByRole("menuitemradio", { name: "Whole board" })
    await expect(whole).toBeVisible()
    await shots(page, "slides-sheet-phone")
    await whole.tap()
    await expect.poll(lastAct(acts)).toEqual({ action: "board_slide", slide: "" })
  })

  test("everyone else sees which slide is up, within the screen", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const { stage } = await joinWithBoard(page, testInfo, { uuid: BOARD, by: PRIYA.identity, draw: "everyone", slide: "f-intro" })
    await expect(stage).toHaveAttribute("data-slide-placed", "f-intro", { timeout: 30_000 })
    const label = page.getByRole("button", { name: "Slide 1 of 3, Intro: show it again" })
    await expect(label).toBeVisible()
    expect((await label.boundingBox())!.x + (await label.boundingBox())!.width).toBeLessThanOrEqual(390)
    await expectFills(page, "f-intro")
    await shots(page, "slides-viewer-phone")
  })
})
