import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Calendar B11 (zoom-01, meet-02, zoom-15): an event carries its own call, made on demand. Its organiser adds it from
// the event's card and takes it off again behind a red confirm. Every member joins it in the app, as themselves, from
// the card and from Home's agenda: members never wait in its lobby (D-CL-5, Meet's Quick access for the
// organisation). Its address is what a copy of the link shares, for the people outside who knock there. These are
// the real pages on a backend stubbed with the server's answers; with SHOTS_DIR set each state is shot in both themes.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen" }

// Sam's own with its call, about to start; Sam's own with none; Maya's with its call, Sam her guest.
const OWN = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c11"
const PLAIN = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c12"
const THEIRS = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c13"
const callAt = (slug: string) => ({ slug, address: `/r/${slug}` })
const ADDED = "quarterly-plan-q8w3e5r7"

type Call = { slug: string; address: string } | null

function events(calls: Map<string, Call>) {
  return [
    { event_uuid: OWN, event_title: "Design review", event_start_time: at(10, 5), event_end_time: at(11), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: PLAIN, event_title: "Quarterly plan", event_start_time: at(14), event_end_time: at(15), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: THEIRS, event_title: "Brand crit", event_start_time: at(16), event_end_time: at(17), event_created_by: MAYA, event_participants: [ME] },
  ].map((e) => ({ ...e, event_call: calls.get(e.event_uuid) ?? null }))
}

/** A call route that fails: `fail`'s method answers as the calendar does a fault it didn't expect, once `held` lets go. */
type Failing = { fail?: "POST" | "DELETE"; held?: Promise<void> }

/** A promise the test lets go of, so a request is seen in flight. */
function gate() {
  let open!: () => void
  const held = new Promise<void>((resolve) => (open = resolve))
  return { held, open }
}

/** The calendar's day as Sam reads it; what the call routes were sent, in order. */
async function openDay(page: Page, testInfo: TestInfo, { fail, held }: Failing = {}) {
  const calls = new Map<string, Call>([
    [OWN, callAt("design-review-k3x9p2qa")],
    [PLAIN, null],
    [THEIRS, callAt("brand-crit-7h2m4d1s")],
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
    "/event/getEvents": () => ({ msg: "ok", data: events(calls) }),
    "/event/getEvent/": (url: URL) => ({ msg: "ok", data: events(calls).find((e) => e.event_uuid === url.pathname.split("/").pop()) }),
    "/calendar/events/": async (url: URL, request: Request) => {
      const parts = url.pathname.split("/")
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
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=day", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${OWN}"]`).first()).toBeVisible({ timeout: 60_000 })
  return sent
}

const card = (page: Page) => page.locator("[data-event-card]")
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
      test.use({ viewport: { width, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone, colorScheme: theme, permissions: ["clipboard-read", "clipboard-write"] })
      const press = async (target: ReturnType<Page["locator"]>) => (phone ? target.tap() : target.click())

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

      test("is added by its organiser from the card, which then offers Join", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent = await openDay(page, testInfo)
        await press(page.locator(`[data-event-uuid="${PLAIN}"]`).first())
        const add = card(page).getByRole("button", { name: "Add a call" })
        await expect(add).toBeVisible({ timeout: 20_000 })
        await reviewShot(page, "event-call-add", theme)
        await press(add)
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveAttribute("href", `/app/meet/join/r/${ADDED}`, { timeout: 20_000 })
        await expect(card(page).getByRole("button", { name: "Add a call" })).toHaveCount(0)
        expect(sent).toEqual([`POST ${PLAIN}`])
      })

      test("keeps Add a call when the server can't add one, busy while it asks, and the toast says why", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { held, open } = gate()
        const sent = await openDay(page, testInfo, { fail: "POST", held })
        await press(page.locator(`[data-event-uuid="${PLAIN}"]`).first())
        const add = card(page).getByRole("button", { name: "Add a call" })
        await press(add)
        await expect(add).toHaveAttribute("aria-busy", "true")
        open()
        await expect(page.getByText("Couldn't add a call", { exact: true })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText("Something went wrong. Try again in a moment.", { exact: true })).toBeVisible()
        await expect(add).not.toHaveAttribute("aria-busy")
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveCount(0)
        await reviewShot(page, "event-call-add-failed", theme)
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
        await expect(card(page).getByRole("button", { name: "Add a call" })).toBeVisible({ timeout: 20_000 })
        await expect(card(page).getByRole("link", { name: "Join call" })).toHaveCount(0)
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
            data: [{ event_uuid: OWN, event_title: "Design review", event_start_time: soon(-5), event_end_time: soon(40), event_created_by: ME, event_participants: [MAYA], event_call: callAt("design-review-k3x9p2qa") }],
          },
        })
        // Home's orbits turn for minutes on a computer, and a review shot waits for a still page (homeGreeting).
        await page.emulateMedia({ reducedMotion: "reduce" })
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const agenda = page.locator(phone ? "[data-today-strip]" : "[data-today-agenda]")
        const join = agenda.getByRole("link", { name: "Join" })
        await expect(join).toHaveAttribute("href", "/app/meet/join/r/design-review-k3x9p2qa", { timeout: 60_000 })
        expect(await join.getAttribute("target")).toBeNull()
        // On a phone, Today's strip sits under the fold.
        await join.scrollIntoViewIfNeeded()
        await reviewShot(page, "event-call-home", theme)
      })
    })
  }
}
