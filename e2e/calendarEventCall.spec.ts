import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { fakeCallServer, type FakePerson } from "./fakeCallServer"
import { focusRing, showsFocusRing, tabOnto } from "./focusRing"
import { animationsSettled } from "./settled"
import { SAM, SHOT_THEMES, eventRoomAnswers, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Calendar B11 (zoom-01, meet-02, zoom-15): an event carries its own call, made on demand. Its organiser adds it from
// the event's card and takes it off again behind a red confirm. Every member joins it in the app, as themselves, from
// the card and from Home's agenda: members never wait in its lobby (D-CL-5, Meet's Quick access for the
// organisation). Its address is what a copy of the link shares, for the people outside who knock there. Its guests
// by email come straight in with their own link, until whoever may change the event makes them knock (meet-02, Meet's
// quick access off). These are the real pages on a backend stubbed with the server's answers; with SHOTS_DIR set each
// state is shot in both themes.
// gcal-15 head B: every event has a call room of its own, made the first time someone joins it. Join call on a
// fresh event opens its member door (/app/meet/e/<id>), which says its title before Join and hands the member's own
// token to the app's call. "Add a guest link" puts a guest call on that room, while guest access and its rooms are on.
// The keyboard reaches each Join (the card's, an agenda row's, Home's) and the card's More, at 1280; at 390 no
// surface (the card, the agenda, Home, the door) scrolls sideways; the door says it is checking the event until it
// answers.
// The green room asks for the camera: a fake one.
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } })

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen" }

// Sam's own with its call, about to start; Sam's own with none; Maya's with its call, Sam her guest. At noon, Sam's
// own with its call and a guest invited by email; at one, Maya's with its call and one, Sam her guest.
const OWN = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c11"
const PLAIN = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c12"
const THEIRS = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c13"
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c14"
const PRESS = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c15"
// A fresh event: nobody added a call to it, and it has its own room all the same (gcal-15).
const FRESH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c16"
const roomOf = (id: string) => `/app/meet/e/${id}`
// An event of Maya's that Sam isn't on, or sees only as busy: no such event, to him.
const NOT_ON = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c17"
// The member's call token for the event's room, as the server mints it, and Sam in the call it opens.
const TOKEN = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: SAM.user_uuid, name: SAM.user_full_name, video: {} })).toString("base64url")}.c2lnbmF0dXJl`
const HOST: FakePerson = { identity: SAM.user_uuid, name: SAM.user_full_name, attributes: { "oc.role": "host" } }
const callAt = (slug: string) => ({ slug, address: `/r/${slug}` })
const ADDED = "quarterly-plan-q8w3e5r7"
const ALEX = { email: "alex@example.org", name: "Alex Kim", role: "required", response: "needs_action" }
const SKIP = "Invited guests skip the lobby"
const SKIP_HINT = "Guests you invited by email come straight in with their own link. When it's off, they knock and wait to be let in."
// The lobby switch is found by its row, so new words fail on the words and a missing switch never passes on a name.
const LOBBY_ROW = "[data-event-call-lobby]"

type Call = { slug: string; address: string; invitees_wait?: boolean } | null

/** The day's events; each has its own room, with a guest link allowed while guest access and its rooms are on. */
function events(calls: Map<string, Call>, guestLinks = true) {
  return [
    { event_uuid: OWN, event_title: "Design review", event_start_time: at(10, 5), event_end_time: at(11), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: PLAIN, event_title: "Quarterly plan", event_start_time: at(14), event_end_time: at(15), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: THEIRS, event_title: "Brand crit", event_start_time: at(16), event_end_time: at(17), event_created_by: MAYA, event_participants: [ME] },
    { event_uuid: LAUNCH, event_title: "Launch sync", event_start_time: at(12), event_end_time: at(12, 45), event_created_by: ME, event_participants: [MAYA],
      event_guests: [{ user_uuid: MAYA.user_uuid, role: "required", response: "accepted" }, ALEX] },
    { event_uuid: PRESS, event_title: "Press prep", event_start_time: at(13), event_end_time: at(13, 45), event_created_by: MAYA, event_participants: [ME],
      event_guests: [{ user_uuid: SAM.user_uuid, role: "required", response: "accepted" }, ALEX] },
    { event_uuid: FRESH, event_title: "Roadmap review", event_start_time: at(15), event_end_time: at(15, 45), event_created_by: ME, event_participants: [MAYA] },
  ].map((e) => ({ ...e, event_call: calls.get(e.event_uuid) ?? null, event_room: { join: roomOf(e.event_uuid), guest_links: guestLinks } }))
}

/**
 * A call route that fails: `fail`'s method (or the lobby's) answers as the calendar does a fault it didn't expect, once
 * `held` lets go. guestLinks: whether guest access and its rooms are on (default on). roomHeld: the door's read of
 * an event's room is answered once it lets go.
 */
type Failing = { fail?: "POST" | "DELETE" | "lobby"; held?: Promise<void>; guestLinks?: boolean; roomHeld?: Promise<void> }

/** A promise the test lets go of, so a request is seen in flight. */
function gate() {
  let open!: () => void
  const held = new Promise<void>((resolve) => (open = resolve))
  return { held, open }
}

/** The calendar's day as Sam reads it; what the call routes were sent, in order. */
async function openDay(page: Page, testInfo: TestInfo, { fail, held, guestLinks = true, roomHeld }: Failing = {}) {
  const calls = new Map<string, Call>([
    [OWN, callAt("design-review-k3x9p2qa")],
    [PLAIN, null],
    [THEIRS, callAt("brand-crit-7h2m4d1s")],
    [LAUNCH, callAt("launch-sync-2v6n8c4x")],
    [PRESS, callAt("press-prep-5t9b3w6e")],
    [FRESH, null],
  ])
  const sent: string[] = []
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": () => ({ msg: "ok", data: events(calls, guestLinks) }),
    "/event/getEvent/": (url: URL) => ({ msg: "ok", data: events(calls, guestLinks).find((e) => e.event_uuid === url.pathname.split("/").pop()) }),
    "/calendar/events/": async (url: URL, request: Request) => {
      const parts = url.pathname.split("/")
      // Its own room (gcal-15): read for its title, and joined.
      const room = rooms(url, request)
      if (room) {
        sent.push(room.sent)
        if (roomHeld && room.sent.startsWith("GET ")) await roomHeld
        return room.answer
      }
      if (parts.at(-2) === "call" && parts.at(-1) === "lobby") {
        const id = parts.at(-3) ?? ""
        const wait = (request.postDataJSON() as { invitees_wait: boolean }).invitees_wait
        sent.push(`POST lobby ${id} ${wait}`)
        if (fail === "lobby") {
          await held
          return withStatus(503, { msg: "Something went wrong. Try again in a moment." })
        }
        const now = calls.get(id)
        if (now) calls.set(id, { ...now, invitees_wait: wait })
        return { msg: "ok", data: calls.get(id) }
      }
      if (parts.at(-1) === "call") {
        const id = parts.at(-2) ?? ""
        sent.push(`${request.method()} ${id}`)
        if (request.method() === fail) {
          await held
          // controllers/Calendar's writeCalendarError, for a fault it didn't expect.
          return withStatus(503, { msg: "Something went wrong. Try again in a moment." })
        }
        calls.set(id, request.method() === "DELETE" ? null : callAt(ADDED))
        return { msg: "ok", data: calls.get(id) }
      }
      const e = events(calls).find((x) => x.event_uuid === parts.at(-1))
      return { msg: "ok", data: e ? { id: e.event_uuid, title: e.event_title, notes: "", start: { at: e.event_start_time, zone: "Europe/London" }, end: { at: e.event_end_time }, all_day: false, sequence: 1, kind: "event", attendees: [], organiser: { user_uuid: e.event_created_by.user_uuid }, email_on_answers: false } : null }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    // Calls on: the member door is a call page (app/app/meet/layout).
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true, calls: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    // The call an event's room opens, as Call State reads it: Sam alone, its host.
    "/calls/current": { msg: "ok", data: { live: true, session: { id: "5e550000-0000-4000-8000-0000000000e3", people: [] }, you: { role: "host", can: [] }, waiting: [] } },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=day", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${OWN}"]`).first()).toBeVisible({ timeout: 60_000 })
  return sent
}

/** The day's events' own rooms, as the server answers them (e2e/stubbedApp eventRoomAnswers): Roadmap review's. */
// Press prep's join fails; any other event's room is one the server says Sam can't join.
const rooms = eventRoomAnswers({ [FRESH]: { title: "Roadmap review", token: TOKEN }, [PRESS]: { title: "Press prep", fail: 503 } })

const card = (page: Page) => page.locator("[data-event-card]")

/** That the page doesn't scroll sideways: nothing on it runs past the screen's sides. */
const flat = (page: Page, what: string) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${what}: the page scrolls sideways` })
    .toBeLessThanOrEqual(0)

/**
 * Where `target`'s focus ring is cut at the middle of a side: the outline's outer edge there (the shared ring is an
 * outline, interaction.css) past the screen or past a box around it that clips on that axis. None, when it is whole.
 */
const ringCuts = (target: Locator) =>
  target.evaluate((el) => {
    const s = getComputedStyle(el)
    if (s.outlineStyle === "none") return ["no outline"]
    const reach = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth) - 0.5
    const r = el.getBoundingClientRect()
    const midX = r.left + r.width / 2
    const midY = r.top + r.height / 2
    const sides: [string, number, number][] = [["left", r.left - reach, midY], ["right", r.right + reach, midY], ["top", midX, r.top - reach], ["bottom", midX, r.bottom + reach]]
    const cuts: string[] = []
    for (const [side, x, y] of sides) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) cuts.push(`${side}: the screen`)
      for (let a = el.parentElement; a; a = a.parentElement) {
        const as = getComputedStyle(a)
        const b = a.getBoundingClientRect()
        const left = b.left + a.clientLeft
        const top = b.top + a.clientTop
        const outX = as.overflowX !== "visible" && (x < left || x > left + a.clientWidth)
        const outY = as.overflowY !== "visible" && (y < top || y > top + a.clientHeight)
        if (outX || outY) cuts.push(`${side}: ${a.tagName.toLowerCase()}${[...a.classList].slice(0, 4).map((c) => `.${c}`).join("")}`)
      }
    }
    return cuts
  })

/**
 * That a menu item reached by the keys shows it in the menu's shared tint (interaction.css: a menu's highlight is its
 * focus, at the press alpha, with no ring), and `rest`, another item, has none.
 */
async function inMenuTint(item: Locator, rest: Locator, what: string) {
  await expect(item, what).toBeFocused()
  await expect(item).toHaveAttribute("data-highlighted", "")
  const tint = (el: Element) => {
    const s = getComputedStyle(el)
    return { a: parseFloat(s.getPropertyValue("--ix-a")), press: parseFloat(s.getPropertyValue("--ix-press-a")) }
  }
  await expect.poll(async () => { const t = await item.evaluate(tint); return t.a > 0 && t.a === t.press }, { message: `${what}: in the menu's tint` }).toBe(true)
  const ring = await focusRing(item)
  expect(ring.focusVisible, `${what}: :focus-visible`).toBe(true)
  expect(ring.outline, `${what}: the tint, not a ring`).toBe("")
  await expect(rest).not.toHaveAttribute("data-highlighted", "")
  expect((await rest.evaluate(tint)).a, "an item at rest has no tint").toBe(0)
}
/**
 * Whether a confirm is the top of the page across its box, so nothing lies over
 * its question: the card that asked it stays open under it (a popover's layer
 * stood over a confirm's, and in Day view, where the card opens under its
 * block, it hid the confirm's title and words). Under a modal, Radix turns off
 * the pointer events of the layers below it, and a probe by point passes over
 * those, so they are back on while it looks: it finds what is drawn on top.
 */
const onTop = (dialog: Locator) =>
  dialog.evaluate((el) => {
    const off = [...document.querySelectorAll<HTMLElement>("[data-radix-popper-content-wrapper], [data-radix-popper-content-wrapper] *")].filter((e) => e.style.pointerEvents === "none")
    for (const e of off) e.style.pointerEvents = "auto"
    try {
      const box = el.getBoundingClientRect()
      return [[0.5, 0.5], [0.1, 0.15], [0.9, 0.15], [0.1, 0.85], [0.9, 0.85]].every(([x, y]) => {
        const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y)
        return !!hit && el.contains(hit)
      })
    } finally {
      for (const e of off) e.style.pointerEvents = "none"
    }
  })

for (const theme of SHOT_THEMES) {
  for (const width of [1280, 390]) {
    const phone = width < 600
    test.describe(`an event's own call at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone, colorScheme: theme, permissions: ["clipboard-read", "clipboard-write", "camera", "microphone"] })
      const press = async (target: ReturnType<Page["locator"]>) => (phone ? target.tap() : target.click())
      // A finger's height on a phone, read once nothing still moves the box: an agenda row comes in from scale(0.96)
      // (content-event-in), and a Join read on the way is short of its own 44px by that much (43.76 in batch wW38).
      const tall = async (target: Locator) => {
        if (!phone) return
        await animationsSettled(target)
        expect((await target.boundingBox())?.height ?? 0, "a finger's height on a phone").toBeGreaterThanOrEqual(44)
      }

      test("is joined from its card in the app, and Copy call link copies its address", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${OWN}"]`).first())
        const join = card(page).getByRole("link", { name: "Join call" })
        await expect(join).toBeVisible({ timeout: 20_000 })
        await expect(join).toHaveAttribute("href", "/app/meet/join/r/design-review-k3x9p2qa")
        // In this tab: a member comes in as themselves.
        expect(await join.getAttribute("target")).toBeNull()
        await reviewShot(page, "event-call-card", theme)
        await press(card(page).getByRole("button", { name: "More" }))
        await press(page.getByRole("menuitem", { name: "Copy call link" }))
        await expect(page.getByText("Call link copied.", { exact: true })).toBeVisible({ timeout: 20_000 })
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL(page.url()).origin + "/r/design-review-k3x9p2qa")
      })

      test("gets a guest link from its organiser, from the card's More, and Join then opens the guest call's door", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${PLAIN}"]`).first())
        // Its own room first: Join call is the card's first action already.
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", roomOf(PLAIN), { timeout: 20_000 })
        await press(card(page).getByRole("button", { name: "More" }))
        const add = page.getByRole("menuitem", { name: "Add a guest link" })
        await expect(add).toBeVisible()
        await reviewShot(page, "event-call-add", theme)
        await press(add)
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", `/app/meet/join/r/${ADDED}`, { timeout: 20_000 })
        await press(card(page).getByRole("button", { name: "More" }))
        await expect(page.getByRole("menuitem", { name: "Remove call" })).toBeVisible()
        await expect(page.getByRole("menuitem", { name: "Add a guest link" })).toHaveCount(0)
        expect(sent).toEqual([`POST ${PLAIN}`])
      })

      test("keeps Add a guest link when the server can't add one, and the toast says why", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { held, open } = gate()
        const sent = await openDay(page, testInfo, { fail: "POST", held })
        await press(page.locator(`[data-event-uuid="${PLAIN}"]`).first())
        await press(card(page).getByRole("button", { name: "More" }))
        await press(page.getByRole("menuitem", { name: "Add a guest link" }))
        open()
        await expect(page.getByText("Couldn't add a guest link", { exact: true })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText("Something went wrong. Try again in a moment.", { exact: true })).toBeVisible()
        // Still its own room, and still a guest link to add.
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", roomOf(PLAIN))
        await reviewShot(page, "event-call-add-failed", theme)
        await press(card(page).getByRole("button", { name: "More" }))
        await expect(page.getByRole("menuitem", { name: "Add a guest link" })).toBeVisible()
        expect(sent).toEqual([`POST ${PLAIN}`])
      })

      test("is taken off by its organiser only after a red confirm", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${OWN}"]`).first())
        await press(card(page).getByRole("button", { name: "More" }))
        await press(page.getByRole("menuitem", { name: "Remove call" }))
        const confirm = page.getByRole("alertdialog", { name: "Remove this event's call?" })
        await expect(confirm).toBeVisible({ timeout: 20_000 })
        await expect.poll(() => onTop(confirm), { message: "the confirm lies over the card that asked it" }).toBe(true)
        await reviewShot(page, "event-call-remove-confirm", theme)
        expect(sent, "nothing is sent before the confirm").toEqual([])
        await press(confirm.getByRole("button", { name: "Remove call" }))
        // Its own room stays: Join opens it, and a guest link may be added again.
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", roomOf(OWN), { timeout: 20_000 })
        await press(card(page).getByRole("button", { name: "More" }))
        await expect(page.getByRole("menuitem", { name: "Add a guest link" })).toBeVisible()
        expect(sent).toEqual([`DELETE ${OWN}`])
      })

      test("keeps the call when the server can't take it off: the confirm says why, once, and stays for another try", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { held, open } = gate()
        const sent = await openDay(page, testInfo, { fail: "DELETE", held })
        await press(page.locator(`[data-event-uuid="${OWN}"]`).first())
        await press(card(page).getByRole("button", { name: "More" }))
        await press(page.getByRole("menuitem", { name: "Remove call" }))
        const confirm = page.getByRole("alertdialog", { name: "Remove this event's call?" })
        const action = confirm.getByRole("button", { name: "Remove call" })
        await press(action)
        await expect(action).toHaveAttribute("aria-busy", "true")
        open()
        await expect(confirm.getByRole("alert")).toHaveText("Something went wrong. Try again in a moment.", { timeout: 20_000 })
        await expect(action).not.toHaveAttribute("aria-busy")
        // Said in the confirm, and by no toast besides (a toast's words, exactly, are its own line).
        await expect(page.getByText("Something went wrong. Try again in a moment.", { exact: true })).toHaveCount(1)
        await reviewShot(page, "event-call-remove-failed", theme)
        await press(confirm.getByRole("button", { name: "Cancel" }))
        await expect(confirm).toHaveCount(0)
        await expect(card(page).getByRole("link", { name: "Join call" })).toBeVisible()
        expect(sent).toEqual([`DELETE ${OWN}`])
      })

      test("is joined by a guest of the event, who can't take it off", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${THEIRS}"]`).first())
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", "/app/meet/join/r/brand-crit-7h2m4d1s", { timeout: 20_000 })
        await press(card(page).getByRole("button", { name: "More" }))
        await expect(page.getByRole("menuitem", { name: "Copy call link" })).toBeVisible()
        await expect(page.getByRole("menuitem", { name: "Remove call" })).toHaveCount(0)
      })

      test("lets its organiser make its guests by email knock, from the event's page, and let them straight in again", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${LAUNCH}"]`).first())
        await press(card(page).getByRole("button", { name: "Open details" }))
        const skip = page.locator(LOBBY_ROW).getByRole("switch")
        await expect(skip).toBeChecked({ timeout: 30_000 })
        await expect.soft(skip).toHaveAccessibleName(SKIP)
        await expect.soft(skip).toHaveAccessibleDescription(SKIP_HINT)
        await skip.scrollIntoViewIfNeeded()
        await reviewShot(page, "event-call-lobby-on", theme)
        await press(skip)
        await expect(skip).not.toBeChecked()
        await expect.poll(() => sent).toEqual([`POST lobby ${LAUNCH} true`])
        await reviewShot(page, "event-call-lobby-off", theme)
        await press(skip)
        await expect(skip).toBeChecked()
        await expect.poll(() => sent).toEqual([`POST lobby ${LAUNCH} true`, `POST lobby ${LAUNCH} false`])
      })

      test("keeps its guests by email coming straight in when the server can't change it, and the toast says why", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { held, open } = gate()
        const sent = await openDay(page, testInfo, { fail: "lobby", held })
        await press(page.locator(`[data-event-uuid="${LAUNCH}"]`).first())
        await press(card(page).getByRole("button", { name: "Open details" }))
        const skip = page.locator(LOBBY_ROW).getByRole("switch")
        await expect(skip).toBeChecked({ timeout: 30_000 })
        await press(skip)
        // Shown as asked, and waiting, while the server answers: a second press can't ask again.
        await expect(skip).not.toBeChecked()
        await expect(skip).toBeDisabled()
        await expect(skip).toHaveAttribute("aria-busy", "true")
        open()
        await expect(page.getByText("Couldn't change who waits", { exact: true })).toBeVisible({ timeout: 20_000 })
        await expect(skip).toBeChecked()
        await expect(skip).toBeEnabled()
        await expect(skip).not.toHaveAttribute("aria-busy")
        await reviewShot(page, "event-call-lobby-failed", theme)
        expect(sent).toEqual([`POST lobby ${LAUNCH} true`])
      })

      test("offers no lobby switch to a guest of the event who may not change it, nor on an event whose guests are all members", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${PRESS}"]`).first())
        await press(card(page).getByRole("button", { name: "More" }))
        await press(page.getByRole("menuitem", { name: "Open" }))
        await expect(page.locator("[data-event-guests]")).toBeVisible({ timeout: 30_000 })
        await expect(page.locator(LOBBY_ROW)).toHaveCount(0)
        await page.goto("/app/calendar?date=2026-10-21&view=day", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await press(page.locator(`[data-event-uuid="${OWN}"]`).first())
        await press(card(page).getByRole("button", { name: "Open details" }))
        await expect(page.locator("[data-event-guests]")).toBeVisible({ timeout: 30_000 })
        await expect(page.locator(LOBBY_ROW)).toHaveCount(0)
      })

      test("is joined on a fresh event in its own room: the door says its title, and Join hands the call the member's token", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openDay(page, testInfo)
        const server = await fakeCallServer(page, { you: HOST, room: `meet-${FRESH}` })
        await press(page.locator(`[data-event-uuid="${FRESH}"]`).first())
        const join = card(page).getByRole("link", { name: "Join call" })
        await expect(join).toHaveAttribute("href", roomOf(FRESH), { timeout: 20_000 })
        expect(await join.getAttribute("target")).toBeNull()
        await tall(join)
        if (phone) await flat(page, "The card")
        await reviewShot(page, "event-room-card", theme)
        await press(join)
        await page.waitForURL(`**${roomOf(FRESH)}`, { timeout: 60_000 })
        // The door's read made nothing: only the title, before Join.
        await expect(page.getByText("Roadmap review").first()).toBeVisible({ timeout: 60_000 })
        const now = page.getByRole("button", { name: "Join now" })
        await expect(now).toBeVisible({ timeout: 30_000 })
        await tall(now)
        if (phone) await flat(page, "The event's door")
        expect(sent).toEqual([`GET room ${FRESH}`])
        await reviewShot(page, "event-room-prejoin", theme)
        await press(now)
        await expect.poll(server.connected, { message: "the event's room connected with the member's token", timeout: 30_000 }).toBe(true)
        expect(sent).toEqual([`GET room ${FRESH}`, `POST room/join ${FRESH}`])
        await reviewShot(page, "event-room-in-call", theme)
      })

      test("tells someone who can't join an event's call in words, and a join that failed", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openDay(page, testInfo)
        // Not on it, or a busy-only reader: the server says there is no such event.
        await page.goto(roomOf(NOT_ON), { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByRole("heading", { name: "You can't join this event's call" })).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: "Go home" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Join now" })).toHaveCount(0)
        await reviewShot(page, "event-room-cant-join", theme)
        // Its join fails: said in words, and Join is there to try again.
        await page.goto(roomOf(PRESS), { waitUntil: "domcontentloaded", timeout: 120_000 })
        const now = page.getByRole("button", { name: "Join now" })
        await press(now.first())
        await expect(page.getByRole("alert").filter({ hasText: "Couldn't join: Something went wrong. Try again in a moment." })).toBeVisible({ timeout: 30_000 })
        await expect(now).toBeEnabled()
        await reviewShot(page, "event-room-join-failed", theme)
        expect(sent).toEqual([`GET room ${NOT_ON}`, `GET room ${PRESS}`, `POST room/join ${PRESS}`])
      })

      test("is joined in its own room from the event's panel and the agenda, a finger's height on a phone", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        // The panel's first action.
        await press(page.locator(`[data-event-uuid="${FRESH}"]`).first())
        await press(card(page).getByRole("button", { name: "Open details" }))
        const inPanel = page.locator("[data-event-view]").getByRole("link", { name: "Join call" })
        await expect(inPanel).toHaveAttribute("href", roomOf(FRESH), { timeout: 30_000 })
        expect(await inPanel.getAttribute("target")).toBeNull()
        await tall(inPanel)
        await reviewShot(page, "event-room-panel", theme)
        // The agenda offers Join from ten minutes before it starts.
        await page.clock.setFixedTime(new Date(2026, 9, 21, 14, 55))
        await page.goto("/app/calendar?date=2026-10-21&view=agenda", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const inAgenda = page.locator(`[data-agenda] [data-event-uuid="${FRESH}"]`).getByRole("link", { name: "Join" })
        await expect(inAgenda).toHaveAttribute("href", roomOf(FRESH), { timeout: 60_000 })
        expect(await inAgenda.getAttribute("target")).toBeNull()
        await tall(inAgenda)
        if (phone) await flat(page, "The agenda")
        await reviewShot(page, "event-room-agenda", theme)
        if (phone) return
        // By the keyboard, the row's Join shows its ring.
        await tabOnto(page, inAgenda)
        await showsFocusRing(page, inAgenda, "The agenda row's Join")
        await reviewShot(page, "event-room-agenda-focus", theme)
      })

      test("offers no guest link with guest access off: its own room is joined all the same", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo, { guestLinks: false })
        await press(page.locator(`[data-event-uuid="${PLAIN}"]`).first())
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", roomOf(PLAIN), { timeout: 20_000 })
        await press(card(page).getByRole("button", { name: "More" }))
        await expect(page.getByRole("menuitem", { name: "Copy call link" })).toBeVisible()
        await expect(page.getByRole("menuitem", { name: "Add a guest link" })).toHaveCount(0)
        await expect(page.getByRole("button", { name: "Add a guest link" })).toHaveCount(0)
        await reviewShot(page, "event-room-guest-links-off", theme)
      })

      test("is joined from Home's agenda in the app", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const soon = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
        await stubBackend(page, testInfo, {
          "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
          "/checkins": { msg: "ok", data: { checkins: [], can_edit: false } },
          "/project/overview": { msg: "ok", data: {} },
          "/ch/suggested": { msg: "ok", data: null },
          "/activity/unified": { msg: "ok", data: { activities: [] } },
          "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
          "/event/getEvents": {
            msg: "ok",
            data: [
              { event_uuid: OWN, event_title: "Design review", event_start_time: soon(-5), event_end_time: soon(40), event_created_by: ME, event_participants: [MAYA], event_call: callAt("design-review-k3x9p2qa") },
              // No guest call and no link in its notes: its own room is its Join (gcal-15).
              { event_uuid: FRESH, event_title: "Roadmap review", event_start_time: soon(5), event_end_time: soon(50), event_created_by: ME, event_participants: [MAYA], event_room: { join: roomOf(FRESH), guest_links: true } },
            ],
          },
        })
        // Home's orbits turn for minutes on a computer, and a review shot waits for a still page (homeGreeting).
        await page.emulateMedia({ reducedMotion: "reduce" })
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const agenda = page.locator(phone ? "[data-today-strip]" : "[data-today-agenda]")
        const join = agenda.getByRole("link", { name: "Join" })
        // The guest call's door, then the fresh event's own room: both in this tab, a finger's height on a phone.
        await expect(join).toHaveCount(2, { timeout: 60_000 })
        await expect(join.first()).toHaveAttribute("href", "/app/meet/join/r/design-review-k3x9p2qa")
        await expect(join.nth(1)).toHaveAttribute("href", roomOf(FRESH))
        for (const one of await join.all()) {
          expect(await one.getAttribute("target")).toBeNull()
          await tall(one)
        }
        // On a phone, Today's strip sits under the fold.
        await join.first().scrollIntoViewIfNeeded()
        if (phone) await flat(page, "Home")
        await reviewShot(page, "event-call-home", theme)
        if (phone) return
        // By the keyboard, the event's own room's Join shows its ring.
        await tabOnto(page, join.nth(1))
        await showsFocusRing(page, join.nth(1), "Home's Join")
        await reviewShot(page, "event-call-home-focus", theme)
      })

      if (!phone) {
        test("is reached on its card by the keyboard: Join's ring is whole, and More opens by Enter and Space and moves by the arrows", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          await openDay(page, testInfo)
          await press(page.locator(`[data-event-uuid="${FRESH}"]`).first())
          const join = card(page).getByRole("link", { name: "Join call" })
          await expect(join).toHaveAttribute("href", roomOf(FRESH), { timeout: 20_000 })
          await tabOnto(page, join)
          await showsFocusRing(page, join, "The card's Join")
          await expect.poll(() => ringCuts(join), { message: "the card's Join: its ring is whole at the middle of each side" }).toEqual([])
          await reviewShot(page, "event-room-card-focus", theme)
          const more = card(page).getByRole("button", { name: "More" })
          await tabOnto(page, more)
          await showsFocusRing(page, more, "The card's More")
          // Enter opens it on its first item, and the arrows move down it.
          await page.keyboard.press("Enter")
          const items = page.getByRole("menuitem")
          await expect(items).toHaveText(["Open", "Copy call link", "Add a guest link"], { timeout: 20_000 })
          await expect(items.first(), "opened by Enter, on its first item").toBeFocused()
          // An arrow moves the focus a tick after its key (Radix's roving focus), so each is a key of its own.
          await page.keyboard.press("ArrowDown")
          await expect(items.nth(1)).toBeFocused()
          await page.keyboard.press("ArrowDown")
          await inMenuTint(page.getByRole("menuitem", { name: "Add a guest link" }), items.first(), "Add a guest link, reached by the arrows")
          await reviewShot(page, "event-call-more-keyboard", theme)
          // Escape closes the menu and gives More the focus back, the card still open; Space opens it again.
          await page.keyboard.press("Escape")
          await expect(items).toHaveCount(0)
          await expect(more, "back on More").toBeFocused()
          await expect(card(page)).toBeVisible()
          await page.keyboard.press(" ")
          await expect(items.first(), "opened by Space, on its first item").toBeFocused({ timeout: 20_000 })
          await page.keyboard.press("ArrowDown")
          await inMenuTint(items.nth(1), items.first(), "Copy call link, reached by the arrow")
        })
      }

      test("says it is checking the event at its door until the server answers, with no green room and no refusal", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { held, open } = gate()
        const sent = await openDay(page, testInfo, { roomHeld: held })
        await page.goto(roomOf(FRESH), { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByRole("status").filter({ hasText: "Checking the link…" })).toBeVisible({ timeout: 60_000 })
        await expect(page.locator("[aria-busy='true']").first()).toBeVisible()
        await expect(page.getByRole("button", { name: "Join now" })).toHaveCount(0)
        await expect(page.getByRole("heading", { name: "You can't join this event's call" })).toHaveCount(0)
        if (phone) await flat(page, "The event's door, checking")
        await reviewShot(page, "event-room-checking", theme)
        expect(sent).toEqual([`GET room ${FRESH}`])
        open()
        await expect(page.getByRole("button", { name: "Join now" })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText("Checking the link…")).toHaveCount(0)
        expect(sent).toEqual([`GET room ${FRESH}`])
      })
    })
  }
}
