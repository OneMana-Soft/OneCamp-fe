import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import * as Y from "yjs"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { boardDoc, boardDocName, boardFixtures, note } from "../scripts/fluidity/fakeBoard.mjs"
import { ring, tell } from "./callRingEvent"
import { CollabRelay } from "./docs/collabRelay"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// miro-27 H5b2, calls with the board, items 1 and 3.
// 1. Start a call from a board: the board's Call opens with "Start a call in...": the conversations the board was
//    called in before first, then the app's one search. Start opens the conversation's own call page; an editor's board
//    goes with it through a one-shot handoff in the tab's sessionStorage (never the URL), which the call reads once, in
//    its own room, within two minutes, and puts up through Call Control (present_board: the server checks again).
// 3. The call's chat beside the board: at 1280 the chat is the call's one side column, the board in view beside it;
//    at 390 it covers the dock as a drawer. The call connects to a fake server (fakeCallServer) named as the channel's
//    call is, so the board's metadata and the call's own chat come as they do in a real call.
// V-779: a board call started with a person rings them, and on the demo nobody answers: the board handed over takes the
// stage from the ring, which keeps a place in the strip (a row under the board on a phone) that puts it back.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})

const BOARD = "b0a4d000-0000-4000-8000-0000000000e6"
const CH = "c4a11000-0000-4000-8000-0000000000c2"
const SID = "5e550000-0000-4000-8000-0000000000ad"
const YOU: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a2", name: "Priya Shah" }
const MAYA: FakePerson = { identity: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", name: "Maya Chen" }
/** Whom a group's ring rings, with Maya. */
const RUNG = [MAYA, PRIYA, { identity: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e70", name: "Jonas Weber" }].map((p) => ({ uuid: p.identity, name: p.name }))
/** A DM's call is named by its two people (services/callInviteService callRefOfRoom). */
const DM_ROOM = `${YOU.identity} ${MAYA.identity}`
const KEY = "onecamp.call.board"
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const PAST = { session_id: "s-past", kind: "channel", conversation: CH, started_at: ago(26), ended_at: ago(25), live: false, on_stage: false, shown_by: "Maya Chen", shown_at: ago(26), people: 3, artefacts: [] }
const PUT_UP = "Put this board up when the call starts"
/** Launch plan's drawing, the same on the board page and on the call's stage: its Agenda note (a note and its label). */
const launchPlan = () => boardDoc(note("n1", 40, 120, "Agenda"))
/** The app's one search, as the server answers it: Priya. */
const SEARCH = { msg: "ok", data: [{ user_uuid: PRIYA.identity, user_name: PRIYA.name, user_dgraph_uid: "0x9a" }] }

const WIDTHS = [
  [1280, false],
  [390, true],
] as const

/** The board, Ann's, opened by Sam with `level` on it (his only access: an owner always edits); its calls are PAST. */
async function openBoard(page: Page, level: "edit" | "view") {
  const levels = { sam: level }
  const update = launchPlan()
  const name = boardDocName(BOARD)
  const collab = collabFor([{ id: name, update, levels }])
  const fixtures: Array<[RegExp, unknown]> = [[/\/board\/getBoardCalls\//, { msg: "ok", data: { calls: [PAST] } }], [/\/user\/searchUserAndChannelList$/, SEARCH], ...boardFixtures([{ uuid: BOARD, title: "Launch plan", levels, update }], USERS.sam, USERS.ann)]
  await fakeApp(page.context(), { app: String(test.info().project.use.baseURL), user: USERS.sam, docs: [], collab, fixtures, log: [] })
  await page.goto(`/app/board/${BOARD}`)
  await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
  await page.locator("[data-board-call]").click({ timeout: 20_000 })
  const panel = page.getByRole("dialog", { name: "Calls with this board" })
  await panel.getByRole("button", { name: "Start a call in…" }).click()
  return panel.getByRole("region", { name: "Start a call" })
}

/**
 * The channel's call page over the fake call server named as the channel's call, Priya in it; with `dm`, the DM's call
 * page with them, you alone in it (they haven't answered). What Call Control is asked lands in `acts`, and present_board
 * puts the board up in the room's metadata, as Call Control does, once `upAfter` (if given) has settled. With `relay`,
 * the stage's board opens over the app's collaboration socket and finds the drawing the relay holds.
 */
async function joinCall(
  page: Page,
  testInfo: TestInfo,
  { metadata = {}, relay, dm, upAfter }: { metadata?: Record<string, unknown>; relay?: CollabRelay; dm?: FakePerson; upAfter?: Promise<unknown> } = {},
) {
  const acts: Array<Record<string, unknown>> = []
  // The call's server, once the page has one: present_board's answer puts the board up through it.
  const room: { server?: Awaited<ReturnType<typeof fakeCallServer>> } = {}
  // What the page throws, and what an error boundary reports: a call that breaks shows "Something broke on this page".
  const errors: string[] = []
  const report = (e: string) => {
    errors.push(e)
    console.log(`PAGEERROR ${e}`)
  }
  page.on("pageerror", (e) => report(`${e.message}\n${(e.stack ?? "").split("\n").slice(0, 8).join("\n")}`))
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) report(m.text().slice(0, 600))
  })
  const token = { msg: "ok", data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJ2aWRlbyI6e319.c2lnbmF0dXJl" } }
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": token,
    "/dm/getCallToken": token,
    ...(dm ? { [`/user/profile/${dm.identity}`]: { msg: "ok", data: { user_uuid: dm.identity, user_name: dm.name, user_full_name: dm.name, user_profile_object_key: "" } } } : {}),
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: false, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "participant", can: [] } } },
    [`/calls/${SID}/act`]: async (_url: URL, request: { postDataJSON: () => Record<string, unknown> }) => {
      const act = request.postDataJSON()
      acts.push(act)
      if (act.action === "present_board") {
        await upAfter
        room.server?.setMetadata({ board: { uuid: act.board, by: YOU.identity, draw: "everyone" } })
      }
      return { msg: "ok", data: { affected: 1 } }
    },
    // The call's chat as the server answers it (business/Guest CallThread): its post, no replies yet.
    [`/calls/${SID}/thread`]: { msg: "ok", data: { post: { id: "p-call", author: "Sam", text: "Sam started a call", created_at: ago(0) }, replies: [], can_reply: true, latest: ago(0) } },
    "/auth/token": { data: { token: "e2e-sam" } },
  })
  if (relay) await relay.attach(page, SAM.user_full_name)
  const call = await fakeCallServer(page, { you: YOU, others: dm ? [] : [PRIYA], metadata, room: dm ? DM_ROOM : CH })
  room.server = call
  await page.goto(dm ? `/app/meet/chat/${dm.identity}` : `/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
  await expect.poll(call.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return { acts, errors, call }
}

/** The call's chat, opened as each screen offers it: Chat in the dock at a computer, More call options on a phone. */
async function openChat(page: Page, phone: boolean) {
  if (phone) {
    await page.getByRole("button", { name: /^More call options/ }).tap()
    await page.getByRole("menuitem", { name: /^Chat/ }).tap()
  } else {
    await page.getByRole("button", { name: "Chat", exact: true }).click()
  }
  const chat = page.locator("aside[data-call-chat]")
  await expect(chat).toBeVisible()
  return chat
}

/**
 * How much of the stage's board is drawn on: the pixels of its canvas that aren't the empty board's (its corner's).
 * The stage's board is dark whatever the theme: Excalidraw paints it through its dark filter, so a note's pale fill
 * lands a few steps off the board's own grey (about 44 on the three channels), hence the low bar.
 */
const inkOn = (stage: Locator) =>
  stage.locator(".excalidraw canvas.static").evaluate((c: HTMLCanvasElement) => {
    const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data
    let ink = 0
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - px[0]) + Math.abs(px[i + 1] - px[1]) + Math.abs(px[i + 2] - px[2]) > 24) ink++
    return ink
  })

async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const [width, phone] of WIDTHS) {
  test.describe(`starting a call from a board at ${width}${phone ? " with touch" : ""}`, () => {
    test.use({ viewport: { width, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone })

    test("an editor starts the call where the board was called before, its board handed over by the tab, never the URL", async ({ page }) => {
      test.setTimeout(150_000)
      const start = await openBoard(page, "edit")
      await expect(start.getByRole("list", { name: "Called with this board before" }).getByRole("button", { name: /In a channel/ })).toBeVisible()
      const box = start.getByRole("checkbox", { name: PUT_UP })
      await expect(box).toBeChecked()
      await expect(start.getByRole("textbox", { name: "Search people, channels or groups" })).toBeVisible()
      await shots(page, `board-call-start-${width}`)
      // The app's own box, its whole row the reach (44 px under a finger): a press on the row leaves the board down,
      // another puts it back up.
      const row = start.locator("label", { hasText: PUT_UP })
      if (phone) expect((await row.boundingBox())!.height, "the row is a finger's reach").toBeGreaterThanOrEqual(44)
      await (phone ? row.tap() : row.click())
      await expect(box).not.toBeChecked()
      await (phone ? row.tap() : row.click())
      await expect(box).toBeChecked()
      // A place picked in the app's one search: Start the call is ready (no call is started from it here).
      await start.getByRole("textbox", { name: "Search people, channels or groups" }).fill("priya")
      await start.getByText(PRIYA.name, { exact: true }).click()
      await expect(start.getByRole("button", { name: "Start the call" })).toBeEnabled()
      await shots(page, `board-call-picked-${width}`)
      // Keyboard: the past conversation is a button in the tab order, and Enter starts it.
      await start.getByRole("button", { name: /In a channel/ }).focus()
      await page.keyboard.press("Enter")
      await expect(page).toHaveURL(new RegExp(`/app/meet/ch/${CH}$`), { timeout: 30_000 })
      const handed = await page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) ?? "null"), KEY)
      expect(handed).toEqual(expect.objectContaining({ room: CH, board: BOARD }))
    })

    test("a reader may start a call, with no board to put up", async ({ page }) => {
      test.setTimeout(150_000)
      const start = await openBoard(page, "view")
      await expect(start.getByRole("checkbox")).toHaveCount(0)
      await start.getByRole("button", { name: /In a channel/ }).click()
      await expect(page).toHaveURL(new RegExp(`/app/meet/ch/${CH}$`), { timeout: 30_000 })
      expect(await page.evaluate((key) => window.sessionStorage.getItem(key), KEY)).toBeNull()
    })

    test("the call puts the handed board up once, in its own room, and drops the handoff: Launch plan on the stage, the chat beside it", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await page.addInitScript(([key, room, board]) => {
        // Once per tab, as the board writes it: a reload must not hand it again.
        if (!window.sessionStorage.getItem("e2e-handed")) {
          window.sessionStorage.setItem("e2e-handed", "1")
          window.sessionStorage.setItem(key, JSON.stringify({ room, board, at: Date.now() }))
        }
      }, [KEY, CH, BOARD] as const)
      // The board's drawing as the board page has it, behind the stage's collaboration socket.
      const relay = new CollabRelay()
      Y.applyUpdate(relay.doc(boardDocName(BOARD)), launchPlan())
      const { acts, errors } = await joinCall(page, testInfo, { relay })
      await expect.poll(() => acts.filter((a) => a.action === "present_board"), { message: "present_board, once, with the board handed over", timeout: 20_000 }).toEqual([expect.objectContaining({ action: "present_board", board: BOARD })])
      expect(await page.evaluate((key) => window.sessionStorage.getItem(key), KEY)).toBeNull()
      // The board the call was started from is up on the stage: its canvas holds Launch plan's note and label, drawn.
      const stage = page.locator(`[data-call-board="${BOARD}"]`)
      await expect(stage).toBeVisible({ timeout: 30_000 })
      await expect(stage.locator('[data-board-canvas][data-board-synced="true"]')).toHaveAttribute("data-board-elements", "2", { timeout: 30_000 })
      await expect.poll(() => inkOn(stage), { message: "the Agenda note drawn on the stage", timeout: 15_000 }).toBeGreaterThan(5_000)
      // At a computer the chat sits beside it; on a phone the chat is a drawer over the stage (the chat test's shots),
      // so the board is shot as it stands.
      if (!phone) await openChat(page, phone)
      await shots(page, `board-call-handed-${width}`)
      expect(acts.filter((a) => a.action === "present_board"), "put up once").toHaveLength(1)
      await expect(page.getByRole("heading", { name: "Something broke on this page" })).toHaveCount(0)
      expect(errors, "the call with its board throws nothing").toEqual([])
    })

    test("a board call that rings a person: the board handed over takes the stage from the ring, whose place in the strip puts it back", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await page.addInitScript(([key, room, board]) => {
        if (!window.sessionStorage.getItem("e2e-handed")) {
          window.sessionStorage.setItem("e2e-handed", "1")
          window.sessionStorage.setItem(key, JSON.stringify({ room, board, at: Date.now() }))
        }
      }, [KEY, DM_ROOM, BOARD] as const)
      const relay = new CollabRelay()
      Y.applyUpdate(relay.doc(boardDocName(BOARD)), launchPlan())
      // The board goes up once the ring shows: put up while it rings, as on the demo, where nobody answers.
      let rang = () => {}
      const ringShows = new Promise<void>((resolve) => (rang = resolve))
      const { acts, errors, call } = await joinCall(page, testInfo, { relay, dm: MAYA, upAfter: ringShows })
      // Your call rings Maya, you alone in it: the ring holds the stage.
      const ringStage = page.locator(`[data-caller-ring="${SID}"]`)
      await ring(page, { state: "ringing", session: SID, people: [{ uuid: MAYA.identity, name: MAYA.name }] }, () => expect(ringStage).toContainText("Ringing Maya…", { timeout: 3_000 }))
      await expect.poll(() => acts.filter((a) => a.action === "present_board"), { message: "present_board, with the board handed over", timeout: 20_000 }).toEqual([expect.objectContaining({ action: "present_board", board: BOARD })])
      rang()
      // The board takes the stage from the ring: Launch plan's note and label, synced and drawn.
      const stage = page.locator(`[data-call-board="${BOARD}"]`)
      await expect(stage).toBeVisible({ timeout: 30_000 })
      await expect(stage.locator('[data-board-canvas][data-board-synced="true"]')).toHaveAttribute("data-board-elements", "2", { timeout: 30_000 })
      await expect.poll(() => inkOn(stage), { message: "the Agenda note drawn on the stage", timeout: 15_000 }).toBeGreaterThan(5_000)
      await expect(ringStage).toHaveCount(0)
      // The ring keeps a place in the strip, in sight, clear of the board: beside it at a computer; on a phone a row under
      // it, as under a share, so the board keeps the stage's width.
      const place = page.getByRole("button", { name: "Show the ring: Ringing Maya…" })
      await expect(place).toBeVisible()
      await expect(place).toContainText("Ringing Maya…")
      await expect(page.locator(`[data-stage-strip="${phone ? "below" : "beside"}"]`)).toBeVisible()
      const [b, r] = [await stage.boundingBox(), await place.boundingBox()]
      expect(b && r, "the board and the ring's place are drawn").toBeTruthy()
      if (phone) {
        expect(r!.y, "the ring's place under the board").toBeGreaterThanOrEqual(b!.y + b!.height - 1)
        expect(b!.width, "the board keeps the stage's width").toBeGreaterThan(360)
      } else {
        expect(r!.x, "the ring's place beside the board").toBeGreaterThanOrEqual(b!.x + b!.width - 1)
      }
      await shots(page, `board-call-ringing-${width}`)
      // Show the ring: back on the stage, the board's place in the strip. At a computer by the keyboard: Tab reaches the
      // ring's place, its outline drawn, and Enter swaps them; the focus follows to the board's place (the pressed place
      // is gone: the focus fell to <body>), so the next Enter swaps them back.
      const boardPlace = page.getByRole("button", { name: "Show the board" })
      if (phone) await place.tap()
      else {
        for (let i = 0; i < 80 && !(await place.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
        await expect(place).toBeFocused()
        expect(await place.evaluate((el) => getComputedStyle(el).outlineStyle), "the ring's place shows its focus").not.toBe("none")
        // The strip clips anything outside a place (DB-128 F1: only the corners of an outer ring showed): its focus ring is drawn inside.
        const inside = (el: Element) => parseFloat(getComputedStyle(el).outlineOffset) + parseFloat(getComputedStyle(el).outlineWidth) <= 0
        expect(await place.evaluate(inside), "the ring's place draws its focus inside, where the strip can't clip it").toBe(true)
        await shots(page, `board-call-ring-tab-${width}`)
        await page.keyboard.press("Enter")
        await expect(boardPlace, "the focus follows to the board's place").toBeFocused()
        expect(await boardPlace.evaluate(inside), "the board's place draws its focus inside too").toBe(true)
      }
      await expect(ringStage).toContainText("Ringing Maya…")
      await expect(stage).toHaveCount(0)
      await expect(boardPlace).toBeVisible()
      // Maya declines: the stage says so, with Ring again.
      await tell(page, { state: "declined", session: SID, by: RUNG[0] })
      await expect(ringStage).toContainText("Maya declined")
      await expect(ringStage.getByRole("button", { name: "Ring again" })).toBeVisible()
      await shots(page, `board-call-ring-pinned-${width}`)
      // Show the board: the board back on the stage, and the ring's place says how the ring ended, its face dimmed, no
      // pulse. It stays while you're alone (Ring again is one press away, on the stage); someone who joins ends it.
      const ringPlace = page.locator("[data-caller-ring-place]")
      if (phone) await boardPlace.tap()
      else {
        await page.keyboard.press("Enter")
        await expect(ringPlace, "the focus follows back to the ring's place").toBeFocused()
      }
      await expect(stage).toBeVisible()
      await expect(ringPlace).toContainText("Maya declined")
      await expect(ringPlace).toHaveAccessibleName("Show the ring: Maya declined")
      await expect(ringPlace.locator(".ring-pulse")).toHaveCount(0)
      await page.waitForTimeout(1_000)
      await expect(ringPlace, "the ended ring's place stays while you're alone").toBeVisible()
      await shots(page, `board-call-ring-ended-${width}`)
      // A group's ring in the place: as many faces as it holds inside its padding (two in a phone's square, three at a
      // computer), and the headline counts them all.
      await ring(page, { state: "ringing", session: SID, people: RUNG }, () => expect(ringPlace).toContainText("Ringing 3 people…", { timeout: 3_000 }))
      const inside = await ringPlace.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const css = getComputedStyle(el)
        return { left: r.left + parseFloat(css.paddingLeft), right: r.right - parseFloat(css.paddingRight) }
      })
      const faces = await ringPlace.locator(":scope > span[aria-hidden] > *").evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().left, e.getBoundingClientRect().right]))
      expect(faces, "the faces the place holds").toHaveLength(phone ? 2 : 3)
      for (const [l, r] of faces) expect(l >= inside.left - 0.5 && r <= inside.right + 0.5, `a face ${l}-${r} inside the place's ${inside.left}-${inside.right}`).toBe(true)
      await shots(page, `board-call-ring-group-${width}`)
      // Maya answers: the ring ends and its place goes; the board keeps the stage. At a computer her tile takes the ring's
      // place in the strip; on a phone the board has the whole stage again, the people in People.
      call.arrive(MAYA)
      await expect(ringPlace).toHaveCount(0)
      await expect(stage).toBeVisible()
      if (phone) {
        await expect(page.locator("[data-stage-strip]")).toHaveCount(0)
        expect((await stage.boundingBox())!.width, "the board keeps the stage's width").toBeGreaterThan(360)
      } else {
        await expect(page.locator('[data-stage-strip="beside"]').getByRole("button", { name: "Show Maya Chen" })).toBeVisible()
      }
      await shots(page, `board-call-answered-${width}`)
      expect(acts.filter((a) => a.action === "present_board"), "put up once").toHaveLength(1)
      await expect(page.getByRole("heading", { name: "Something broke on this page" })).toHaveCount(0)
      expect(errors, "the call with its board and its ring throws nothing").toEqual([])
    })

    test("the call puts nothing up for another room's handoff, or a stale one", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await page.addInitScript(([key, board]) => {
        window.sessionStorage.setItem(key, JSON.stringify({ room: "3e9b8a7f6e5d4c439b8a9f8e7d6c5243", board, at: Date.now() }))
      }, [KEY, BOARD] as const)
      const { acts } = await joinCall(page, testInfo)
      await page.waitForTimeout(3_000)
      expect(acts.filter((a) => a.action === "present_board")).toEqual([])
      expect(await page.evaluate((key) => window.sessionStorage.getItem(key), KEY)).toBeNull()
    })

    test("the call's chat sits beside the board on its stage, the board in view at a computer, a drawer over the dock on a phone", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { errors } = await joinCall(page, testInfo, { metadata: { board: { uuid: BOARD, by: YOU.identity, draw: "everyone" } } })
      const stage = page.locator(`[data-call-board="${BOARD}"]`)
      await expect(stage).toBeVisible({ timeout: 30_000 })
      const chat = await openChat(page, phone)
      const [s, c] = [await stage.boundingBox(), await chat.boundingBox()]
      expect(s && c, "the stage and the chat are drawn").toBeTruthy()
      if (!phone) {
        // One column beside the stage: the board ends where the chat begins, and keeps most of the width.
        expect(c!.x).toBeGreaterThanOrEqual(s!.x + s!.width - 1)
        expect(s!.width).toBeGreaterThan(c!.width * 1.5)
      } else {
        // A drawer: the chat spans the phone's width and reaches its foot, over the dock.
        expect(c!.width).toBeGreaterThan(380)
        expect(c!.y + c!.height).toBeGreaterThanOrEqual(844 - 2)
      }
      await expect(chat.getByRole("button", { name: "Close chat" })).toBeVisible()
      await shots(page, `board-call-chat-${width}`)
      await expect(page.getByRole("heading", { name: "Something broke on this page" })).toHaveCount(0)
      expect(errors, "the call with its board and chat throws nothing").toEqual([])
    })
  })
}
