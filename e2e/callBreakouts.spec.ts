import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { expectToolsInLine } from "./boardTools"
import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { fakeSpeech, speechCounts } from "./fakeSpeech"
import { reviewShot, SAM, SHOT_THEMES, stubBackend, withStatus } from "./stubbedApp"

// Breakout rooms for whoever runs the call (calls package C, meet-10 and
// zoom-02): from More, name the rooms, put people in them, open them, speak to
// every room and call everyone back. Each act goes to the server as the call's
// act; the rooms themselves come back as the room's metadata, which the fake
// call server (fakeCallServer) sets as LiveKit brings it. Someone who doesn't
// run the call is never offered the rooms.
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["camera", "microphone"],
})
const CH = "c0ffee00-0000-4000-8000-0000000000cd"
const SID = "5e550000-0000-4000-8000-0000000000ad"
const HOST: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "host", "oc.can": "mute,mute_all,breakouts" } }
const PARTICIPANT: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "participant", "oc.can": "" } }
const PRIYA: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a1", name: "Priya Shah" }
const JO: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a2", name: "Jo Park" }
// A fourth person, so a wide stage draws a 2x2 grid whose fourth tile's name sits mid-stage, where the captions are.
const ALEX: FakePerson = { identity: "9a1c0000-0000-4000-8000-0000000000a3", name: "Alex Kim" }
// A board Priya presents on the stage.
const BOARD = "b0a4d000-0000-4000-8000-0000000000cd"
// Someone in one of the call's rooms whom the host's screen never saw in the call.
const UNSEEN = "9a1c0000-0000-4000-8000-0000000000a4"
// The call's captions, turned on by Maya Chen, as the room's metadata carries them.
const CAPTIONS_ON = { on: true, by: "Maya Chen", byId: "9a1c0000-0000-4000-8000-0000000000c9", since: 1_761_000_000_000, where: "browser", kept: false }
// The call's token, which says who you are as LiveKit's does: LiveKit names your part from its sub and name.
const MAIN_TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const ROOM_TOKEN = (n: number) => `eyJhbGciOiJIUzI1NiJ9.room-${n}.c2lnbmF0dXJl`
const ROOMS = [
  { n: 1, name: "Design" },
  { n: 2, name: "Launch" },
]

/** The call, every act it sends (`acts`), and every switch of its captions (`switched`). */
async function stubCall(page: Page, testInfo: TestInfo) {
  const acts: Record<string, unknown>[] = []
  const switched: { room_name: string; on: boolean }[] = []
  await stubBackend(page, testInfo, {
    "/config/client": { msg: "ok", data: { features: { calls: true } } },
    "/ch/getCallToken": { msg: "ok", data: { token: MAIN_TOKEN } },
    "/ch/channelBasicInfo": { msg: "ok", channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_admin: true, ch_call_active: true } },
    "/calls/current": { msg: "ok", data: { live: true, session: { id: SID, people: [] }, you: { role: "host", can: ["breakouts"] } } },
    [`/calls/${SID}/act`]: (_url: URL, request: { postDataJSON: () => Record<string, unknown> }) => {
      acts.push(request.postDataJSON())
      return { msg: "ok", data: { affected: 2 } }
    },
    // A room's own token (slice 3): the room asked for, by its number.
    [`/calls/${SID}/breakout-token`]: (_url: URL, request: { postDataJSON: () => { room: number } }) => {
      const n = request.postDataJSON().room
      return { msg: "ok", data: { token: ROOM_TOKEN(n), room: `call-room-${n}`, session: SID, number: n, name: ROOMS[n - 1].name } }
    },
    // A board on the stage opens its collaboration session with a token of
    // the member's own; the socket itself stays silent (stubBackend).
    "/auth/token": { data: { token: "e2e-sam" } },
    // Captions for the whole call, as the server switches them: only for a
    // call it's told (SetCallTranscription's "Say which call.").
    "/livekit/transcription": (_url: URL, request: { postDataJSON: () => { room_name: string; on: boolean } }) => {
      const asked = request.postDataJSON()
      switched.push(asked)
      return asked.room_name.trim() ? { msg: "ok", data: { on: asked.on } } : withStatus(400, { msg: "Say which call." })
    },
  })
  return { acts, switched }
}
/** Opens the channel's call and joins it. */
async function joinCall(page: Page) {
  await page.goto(`/app/meet/ch/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Join now" }).click({ timeout: 60_000 })
}
async function joinConnected(page: Page, testInfo: TestInfo, you: FakePerson, metadata: Record<string, unknown> = {}, others: FakePerson[] = [PRIYA, JO]) {
  const { acts } = await stubCall(page, testInfo)
  const server = await fakeCallServer(page, { you, others, metadata })
  await joinCall(page)
  await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
  return { server, acts }
}
async function shots(page: Page, name: string) {
  for (const theme of SHOT_THEMES) {
    await page.emulateMedia({ colorScheme: theme })
    await reviewShot(page, name, theme)
  }
  await page.emulateMedia({ colorScheme: "light" })
}
// A bar over the dock lifts the captions by the room it takes, so it never
// covers their start (the live walk of 28 Oct read "…eryone else's appears here").
// With no bar they ride over the dock. And at every width the tiles, or a
// board on the stage, end above them, so they never cover a tile's name or
// the board (DESIGN-BUILD-26: "Priya Shah" at 390, the fourth of four tiles at 1280).
async function captionsClear(page: Page, under: Locator) {
  await expect(under).toBeVisible()
  await expect
    .poll(async () => {
      const [captions, over] = await Promise.all([page.locator("[data-captions]").boundingBox(), under.boundingBox()])
      if (!captions || !over) return "the captions or what's under them isn't drawn"
      const into = Math.round(captions.y + captions.height - over.y)
      if (into > 0) return `the captions end ${into} px into the bar or dock`
      // At least one name or board must be read, or the check would pass with nothing to check.
      let read = 0
      for (const shown of await page.locator("[data-name-plate], [data-call-board]").all()) {
        const box = await shown.boundingBox()
        if (!box) continue
        read++
        const covers = box.y + box.height > captions.y && box.y < captions.y + captions.height && box.x + box.width > captions.x && box.x < captions.x + captions.width
        if (!covers) continue
        return (await shown.getAttribute("data-call-board")) === null ? `the captions cover ${(await shown.innerText()).trim()}'s name` : "the captions cover the board"
      }
      return read ? "clear" : "no tile's name plate or board is drawn"
    }, { message: "the captions end above the bar or dock and cover no tile's name or board" })
    .toBe("clear")
}
const more = (page: Page) => page.getByRole("button", { name: "More call options" })

for (const [label, viewport, touch] of [
  ["at 1280", { width: 1280, height: 860 }, false],
  ["at 390 with touch", { width: 390, height: 844 }, true],
] as const) {
  test.describe(label, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = (l: ReturnType<Page["getByRole"]>) => (touch ? l.tap({ timeout: 60_000 }) : l.click({ timeout: 60_000 }))
    // The app's Select: its list, or on a phone its sheet, then the option.
    const pick = async (trigger: ReturnType<Page["getByRole"]>, option: string) => {
      await press(trigger)
      await press(trigger.page().getByRole("option", { name: option, exact: true }))
    }

    test("the host names the rooms, puts people in them, opens them, speaks to them and calls everyone back", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const { server, acts } = await joinConnected(page, testInfo, HOST)
      if (touch) {
        await press(more(page))
        await press(page.getByRole("menuitem", { name: "Breakout rooms" }))
      } else await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Breakout rooms" }))
      const panel = page.getByRole("complementary", { name: "Breakout rooms" })
      await expect(panel.getByLabel("Room 1's name")).toHaveValue("Room 1")
      await shots(page, "breakouts-setup")
      await panel.getByLabel("Room 1's name").fill("Design")
      await panel.getByLabel("Room 2's name").fill("Launch")
      await press(panel.getByRole("button", { name: "Make 2 rooms" }))
      await expect.poll(() => acts.at(-1)).toEqual({ action: "breakouts_set", rooms: ["Design", "Launch"] })

      server.setMetadata({ breakouts: { open: false, rooms: ROOMS, assigned: { [JO.identity]: 2 } } })
      await expect(panel.getByRole("status")).toHaveText("The rooms aren't open yet")
      await pick(panel.getByLabel("Priya Shah's room"), "Design")
      await expect.poll(() => acts.at(-1)).toEqual({ action: "breakouts_assign", identity: PRIYA.identity, room: 1 })
      server.setMetadata({ breakouts: { open: false, rooms: ROOMS, assigned: { [JO.identity]: 2, [PRIYA.identity]: 1 } } })
      await expect(panel.locator('[data-breakout-room="1"]')).toContainText("Priya Shah")
      await shots(page, "breakouts-assigned")
      await pick(panel.getByLabel("Close the rooms after"), "15 minutes")
      await press(panel.getByRole("button", { name: "Open rooms" }))
      await expect.poll(() => acts.at(-1)).toEqual({ action: "breakouts_open", on: false, minutes: 15 })

      const opened = { open: true, rooms: ROOMS, assigned: { [JO.identity]: 2, [PRIYA.identity]: 1 }, endsAt: Date.now() + 15 * 60_000 }
      server.setMetadata({ breakouts: opened })
      await expect(panel.getByRole("status")).toContainText(/The rooms are open: 1[45]:\d\d left/)
      // Gone to their rooms, they are no longer in the host's own room, and the
      // panel still names them (the live walk of 28 Oct read "2 people · 2 more").
      server.gone(PRIYA.identity)
      server.gone(JO.identity)
      await expect(panel.locator('[data-breakout-room="1"]')).toContainText("Priya Shah")
      await expect(panel.locator('[data-breakout-room="2"]')).toContainText("Jo Park")
      await expect(panel.getByText(/\d more/)).toHaveCount(0)
      await panel.getByLabel("Message to every room").fill("Five minutes, then back")
      await press(panel.getByRole("button", { name: "Send to every room" }))
      await expect.poll(() => acts.at(-1)).toEqual({ action: "breakouts_broadcast", text: "Five minutes, then back" })
      await shots(page, "breakouts-open")
      // Someone this screen never saw in the call (they went straight to a room)
      // is counted beside the people it can name, never shown as a blank name.
      server.setMetadata({ breakouts: { ...opened, assigned: { ...opened.assigned, [UNSEEN]: 1 } } })
      await expect(panel.locator('[data-breakout-room="1"]')).toContainText("2 people")
      await expect(panel.locator('[data-breakout-room="1"]')).toContainText("Priya Shah, 1 more")
      await expect(panel.locator('[data-breakout-room="2"]')).toContainText("Jo Park")
      await shots(page, "breakouts-open-partial")
      await press(panel.getByRole("button", { name: "Close rooms" }))
      await expect.poll(() => acts.at(-1)).toEqual({ action: "breakouts_close" })
      server.setMetadata({ breakouts: { open: true, rooms: ROOMS, assigned: {}, closingAt: Date.now() + 30_000 } })
      await expect(panel.getByRole("status")).toContainText(/Everyone comes back in 0:[23]\d/)
      await expect(panel.getByRole("button", { name: "Calling everyone back" })).toBeDisabled()
      await shots(page, "breakouts-closing")
    })

    test("everyone joins their room, hears what's said to every room, and comes back when they close", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const open = { open: true, rooms: ROOMS, assigned: { [PARTICIPANT.identity]: 2, [PRIYA.identity]: 1 } }
      const { server, acts } = await joinConnected(page, testInfo, PARTICIPANT, { breakouts: open })
      const bar = page.getByRole("region", { name: "Breakout rooms" })
      await expect(bar).toContainText("Breakout rooms are open: you're in Launch")
      await shots(page, "breakouts-join")
      await press(bar.getByRole("button", { name: "Join Launch" }))
      await expect.poll(() => server.joins().at(-1), { message: "the call joined Launch with its own token" }).toBe(ROOM_TOKEN(2))
      expect(acts).toContainEqual({ action: "breakout_choose", room: 2 })
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)
      server.setMetadata({ breakouts: { ...open, room: 2, endsAt: Date.now() + 10 * 60_000 } })
      await expect(bar).toContainText(/Launch · (10:00|9:5\d) left/)
      await expect(page.getByRole("button", { name: "Leave call" }).or(page.getByRole("button", { name: "Leave or end the call" }))).toBeVisible()
      await server.sendData("oc.call", { t: "breakout_broadcast", by: "Maya Chen", text: "Five minutes, then back" })
      // In the bar, never a toast over it (DB-25): the message, the time left and Back all show.
      await expect(bar).toContainText("Maya Chen, to every room: Five minutes, then back")
      await expect(bar.getByRole("button", { name: "Back to main room" })).toBeVisible()
      await shots(page, "breakouts-in-room")
      server.setMetadata({ breakouts: { ...open, room: 2, closingAt: Date.now() + 30_000 } })
      await expect(bar).toContainText(/Back to the main room in 0:[23]\d/)
      await expect(bar).toContainText("Maya Chen, to every room")
      await shots(page, "breakouts-closing-in-room")
      await server.sendData("oc.call", { t: "breakout" })
      await expect.poll(() => server.joins().at(-1), { message: "the call went back to its main room" }).toBe(MAIN_TOKEN)
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)
      expect(server.joins()).toEqual([MAIN_TOKEN, ROOM_TOKEN(2), MAIN_TOKEN])
    })

    // A move is a new connection, and the call's view mounts again under it.
    // What the person chose or was told belongs to the call, not the room
    // (the live walk of 28 Oct found each lost on a move).
    test("a move keeps the call's clock, a dismissed captions notice and Stop captioning me", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await fakeSpeech(page)
      const open = { open: true, rooms: ROOMS, assigned: { [PARTICIPANT.identity]: 2 } }
      const { server } = await joinConnected(page, testInfo, PARTICIPANT, { breakouts: open, transcription: CAPTIONS_ON })
      // The green room's choice, the microphone on, is published once the call connects: wait for
      // the dock's switch to say so. Pressing Unmute meanwhile raced it, and a press that landed
      // just after the microphone came on turned it off again.
      const dock = page.getByRole("toolbar", { name: "Call controls" })
      await expect(dock.getByRole("button", { name: "Mute", exact: true }), "the green room's microphone is on").toBeVisible({ timeout: 30_000 })
      await expect.poll(() => speechCounts(page).then((c) => c.live), { message: "this person's speech is captioned", timeout: 30_000 }).toBe(1)
      const notice = page.locator("[data-captions-notice]")
      await expect(notice).toContainText("Maya Chen turned on captions")
      await press(notice.getByRole("button", { name: "Stop captioning me" }))
      await expect.poll(() => speechCounts(page).then((c) => c.live)).toBe(0)
      await press(notice.getByRole("button", { name: "Got it" }))
      await expect(notice).toHaveCount(0)
      const pill = page.locator("[data-place-pill]")
      await expect(pill).toContainText(/0:0[3-9]/, { timeout: 15_000 })
      const seconds = async () => {
        const [, m, s] = (await pill.innerText()).match(/(\d+):(\d\d)/) ?? []
        return Number(m) * 60 + Number(s)
      }
      const before = await seconds()

      const bar = page.getByRole("region", { name: "Breakout rooms" })
      await captionsClear(page, bar)
      await shots(page, "breakouts-captions-main")
      await press(bar.getByRole("button", { name: "Join Launch" }))
      await expect.poll(() => server.joins().at(-1)).toBe(ROOM_TOKEN(2))
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)
      await expect(bar.getByRole("button", { name: "Back to main room" })).toBeVisible()
      // The call's clock goes on, the notice stays dismissed, and this person's own speech still isn't captioned.
      expect(await seconds()).toBeGreaterThanOrEqual(before)
      await expect(notice).toHaveCount(0)
      expect((await speechCounts(page)).live).toBe(0)
      // In the room too, the room's bar never covers the captions.
      await captionsClear(page, bar)
      await shots(page, "breakouts-move-keeps")
    })

    test("the host's Visit a breakout room bar never covers the captions", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await fakeSpeech(page)
      const open = { open: true, rooms: ROOMS, assigned: { [JO.identity]: 2, [PRIYA.identity]: 1 }, endsAt: Date.now() + 15 * 60_000 }
      await joinConnected(page, testInfo, HOST, { breakouts: open, transcription: CAPTIONS_ON })
      const bar = page.getByRole("region", { name: "Breakout rooms" })
      await expect(bar).toContainText("Visit a breakout room")
      await captionsClear(page, bar)
      await shots(page, "breakouts-captions-visit")
    })

    test("with no bar, the captions ride over the dock and cover no tile's name", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await fakeSpeech(page)
      await joinConnected(page, testInfo, HOST, { transcription: CAPTIONS_ON })
      await expect(page.getByRole("region", { name: "Breakout rooms" })).toHaveCount(0)
      await captionsClear(page, page.getByRole("toolbar", { name: "Call controls" }))
      await shots(page, "breakouts-captions-nobar")
    })

    // Four people fill a wide stage's 2x2 grid, and the fourth tile's name sits
    // mid-stage, where the captions are (DESIGN-BUILD-26/27). The tiles make
    // room at every width, and again when a bar comes up mid-call.
    test("four people's tiles end above the captions, with or without a bar", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await fakeSpeech(page)
      const { server } = await joinConnected(page, testInfo, HOST, { transcription: CAPTIONS_ON }, [PRIYA, JO, ALEX])
      // A phone pages its tiles; a wide stage shows all four.
      if (!touch) await expect(page.locator("[data-name-plate]")).toHaveCount(4)
      await captionsClear(page, page.getByRole("toolbar", { name: "Call controls" }))
      await shots(page, "captions-four-nobar")

      const open = { open: true, rooms: ROOMS, assigned: { [JO.identity]: 2, [PRIYA.identity]: 1 }, endsAt: Date.now() + 15 * 60_000 }
      server.setMetadata({ transcription: CAPTIONS_ON, breakouts: open })
      const bar = page.getByRole("region", { name: "Breakout rooms" })
      await expect(bar).toContainText("Visit a breakout room")
      await captionsClear(page, bar)
      await shots(page, "captions-four-bar")
    })

    // What's presented makes room too: a board on the stage, and the names in the strip beside it.
    test("a board on the stage ends above the captions, and so do the names beside it", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await fakeSpeech(page)
      await joinConnected(page, testInfo, HOST, { transcription: CAPTIONS_ON, board: { uuid: BOARD, by: PRIYA.identity, draw: "everyone" } }, [PRIYA, JO, ALEX])
      await expect(page.locator(`[data-call-board="${BOARD}"]`)).toBeVisible({ timeout: 60_000 })
      await captionsClear(page, page.getByRole("toolbar", { name: "Call controls" }))
      await shots(page, "captions-board")
    })

    test("a board on the stage keeps More tools on its tools' line", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await joinConnected(page, testInfo, HOST, { board: { uuid: BOARD, by: PRIYA.identity, draw: "everyone" } }, [PRIYA])
      const board = page.locator(`[data-call-board="${BOARD}"]`)
      await expect(board).toBeVisible({ timeout: 60_000 })
      await expectToolsInLine(board, touch)
      // A phone's row scrolls: the shot shows its end, More tools beside the last tools.
      await board.locator(".App-toolbar__extra-tools-trigger").scrollIntoViewIfNeeded()
      await shots(page, "board-tools-line")
    })

    // V-30: LiveKit names the room only from the join's answer, so captions
    // confirmed while the call still connected went to the server naming no
    // call, and it answered "Say which call.". They go once the call connects.
    test("captions confirmed while the call still connects come on once it connects", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await fakeSpeech(page)
      const { switched } = await stubCall(page, testInfo)
      const server = await fakeCallServer(page, { you: HOST, others: [PRIYA, JO], holdJoin: true })
      await joinCall(page)
      // The dock's Captions; on a phone, the same row under More.
      if (touch) {
        await press(more(page))
        await press(page.getByRole("menuitem", { name: "Turn on captions" }))
      } else await press(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Turn on captions" }))
      const asked = page.getByRole("alertdialog", { name: "Turn on captions for everyone?" })
      await press(asked.getByRole("button", { name: "Turn on captions" }))
      expect(await server.connected(), "the call is still connecting").toBe(false)
      // The dialog waits for the call, its action busy, and says nothing has gone wrong.
      await expect(asked).toBeVisible()
      await expect(asked.getByRole("alert")).toHaveCount(0)
      await shots(page, "captions-confirm-waiting")

      server.releaseJoin()
      await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
      await expect.poll(() => switched, { message: "captions were asked for once, naming the call" }).toEqual([{ room_name: "fake-call", on: true }])
      await expect(asked).toHaveCount(0)
      // The server writes them into the room's metadata, and the call shows them.
      server.setMetadata({ transcription: { on: true, by: SAM.user_full_name, byId: HOST.identity, since: Date.now(), where: "browser", kept: false } })
      await expect(page.locator("[data-captions]")).toBeVisible()
      await shots(page, "captions-on-after-connect")
    })

    // DB-27's should-fix: LiveKit names your own part only from the join's answer, so until the call connected your
    // own tile read "Guest", and its face "G". The call's token already says who you are.
    test("your own tile reads your name while the call still connects", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await stubCall(page, testInfo)
      const server = await fakeCallServer(page, { you: HOST, others: [PRIYA, JO], holdJoin: true })
      await joinCall(page)
      const tiles = page.locator("[data-stage-tile]")
      await expect(tiles).toHaveCount(1, { timeout: 60_000 })
      expect(await server.connected(), "the call is still connecting").toBe(false)
      await expect(tiles).toContainText(SAM.user_full_name)
      await expect(tiles).not.toContainText("Guest")
      await expect(tiles.locator("[data-camera-off]")).toContainText("SR")
      await shots(page, "own-tile-connecting")

      server.releaseJoin()
      await expect.poll(server.connected, { message: "the room connected to the fake call server", timeout: 30_000 }).toBe(true)
      // A phone pages its tiles, two to a page, your own first; a wide stage shows all three.
      await expect(tiles).toHaveCount(touch ? 2 : 3)
      await expect(tiles.filter({ hasText: SAM.user_full_name })).toHaveCount(1)
      await expect(tiles.filter({ hasText: "Guest" })).toHaveCount(0)
    })

    test("while people choose, everyone picks a room, and goes back to the main room when they like", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const open = { open: true, choose: true, rooms: ROOMS, assigned: {} }
      const { server, acts } = await joinConnected(page, testInfo, PARTICIPANT, { breakouts: open })
      const bar = page.getByRole("region", { name: "Breakout rooms" })
      await expect(bar).toContainText("Breakout rooms are open: pick one")
      await shots(page, "breakouts-choose")
      await press(bar.getByRole("button", { name: "Join Design" }))
      await expect.poll(() => server.joins().at(-1)).toBe(ROOM_TOKEN(1))
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)
      server.setMetadata({ breakouts: { ...open, room: 1 } })
      await press(bar.getByRole("button", { name: "Back to main room" }))
      await expect.poll(() => server.joins().at(-1)).toBe(MAIN_TOKEN)
      await expect.poll(() => acts.at(-1)).toEqual({ action: "breakout_choose", room: 0 })
    })

    // A guest moves as a member does, on the guest page (CR-68's SF2 on C
    // web): the room's token comes from the guest door with the call token
    // they joined with, they send no act (the server counts the room they take
    // a token for), and the server's word brings them back to the main room.
    test("a guest at a room's address joins their room and comes back when it closes", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const DOOR = "/public/r/maya"
      const guest: FakePerson = { identity: "guest-9a1c0000-00a3", name: "Gia Russo", attributes: { "oc.role": "guest", "oc.can": "" } }
      const asks: { auth: string; body: Record<string, unknown> }[] = []
      const memberActs: string[] = []
      await stubBackend(page, testInfo, {
        [DOOR]: { msg: "ok", data: { state: "live", available: true, title: "Maya Chen's room", workspace_name: "Acme" } },
        [`${DOOR}/join`]: { msg: "ok", data: { token: MAIN_TOKEN, room: "call-room" } },
        "/guest/calls/breakout-token": (_url: URL, request: { headers: () => Record<string, string>; postDataJSON: () => Record<string, unknown> }) => {
          const body = request.postDataJSON()
          asks.push({ auth: request.headers()["authorization"] ?? "", body })
          const n = Number(body.room)
          return { msg: "ok", data: { token: ROOM_TOKEN(n), room: `call-room-${n}`, number: n, name: ROOMS[n - 1].name } }
        },
      })
      page.on("request", (r) => {
        const path = new URL(r.url()).pathname
        if (!path.includes("/guest/") && /\/calls\/[^/]+\/(act|breakout-token)$/.test(path)) memberActs.push(path)
      })
      const open = { open: true, rooms: ROOMS, assigned: { [guest.identity]: 1, [PRIYA.identity]: 1 } }
      const server = await fakeCallServer(page, { you: guest, others: [PRIYA, JO], metadata: { breakouts: open } })
      await page.goto("/r/maya", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.getByLabel("Your name").fill("Gia Russo")
      await press(page.getByRole("button", { name: "Join now" }))
      await expect.poll(server.connected, { message: "the guest's call connected to the fake call server", timeout: 30_000 }).toBe(true)
      const bar = page.getByRole("region", { name: "Breakout rooms" })
      await expect(bar).toContainText("Breakout rooms are open: you're in Design", { timeout: 30_000 })
      await shots(page, "breakouts-guest-join")
      await press(bar.getByRole("button", { name: "Join Design" }))
      await expect.poll(() => server.joins().at(-1), { message: "the guest's call joined Design with its own token" }).toBe(ROOM_TOKEN(1))
      expect(asks).toEqual([{ auth: `Bearer ${MAIN_TOKEN}`, body: { room: 1, language: "" } }])
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)
      server.setMetadata({ breakouts: { ...open, room: 1, closingAt: Date.now() + 30_000 } })
      await expect(bar).toContainText(/Back to the main room in 0:[23]\d/)
      await shots(page, "breakouts-guest-closing")
      await server.sendData("oc.call", { t: "breakout" })
      await expect.poll(() => server.joins().at(-1), { message: "the guest's call went back to its main room" }).toBe(MAIN_TOKEN)
      await expect.poll(server.connected, { timeout: 30_000 }).toBe(true)
      expect(server.joins()).toEqual([MAIN_TOKEN, ROOM_TOKEN(1), MAIN_TOKEN])
      expect(memberActs, "a guest never asks the member's call routes").toEqual([])
    })

    test("someone who doesn't run the call isn't offered the rooms", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await joinConnected(page, testInfo, PARTICIPANT, { breakouts: { open: false, rooms: ROOMS, assigned: {} } })
      const dock = page.getByRole("toolbar", { name: "Call controls" })
      await expect(dock.getByRole("button", { name: "Leave call" })).toBeVisible({ timeout: 60_000 })
      await expect(dock.getByRole("button", { name: "Breakout rooms" })).toHaveCount(0)
      if (touch) {
        await press(more(page))
        await expect(page.getByRole("menu")).toBeVisible()
        await expect(page.getByRole("menuitem", { name: "Breakout rooms" })).toHaveCount(0)
      }
    })
  })
}
