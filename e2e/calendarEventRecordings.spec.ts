import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { takesAFinger } from "./menuReach"
import { recordedVideo } from "./recordedVideo"
import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Calls head C (meet-02): an event's "Recordings & notes". Each of its calls
// that kept something, newest first, as GET /calendar/events/{id}/call/artefacts
// answers whoever may read the event. Play opens the one player by the event's
// own play route, read by the same id the list was; Notes opens the call's
// notes; Conversation opens the chat its recap went to, for whoever is in it.
// An event that kept nothing, or one the calendar won't open to its reader,
// shows no section and says nothing.
// Follow-up 1: whoever may change the event deletes what a call made, its
// recording and transcript, by DELETE /calendar/events/{id}/call/artefacts/{key};
// it leaves the list at once, and the toast's Undo posts .../restore and brings
// it back. A guest who may only read the event plays it, with no Delete. The
// server is a stateful stand-in that answers as the evdel head does.
// Head C2 (meet-02 WIN): the player reads a call's words by the event's own
// .../artefacts/{key}/transcript, a page at a time, beside its recording; a
// call that wasn't recorded offers Read transcript, which opens them alone.
// Beside the calendar, a link that leaves the event closes its side panel
// (DESIGN-BUILD-61's MUST 1).
// meet-02 LIVE (DESIGN-BUILD-64's MUST 1): a real recording's stage is its
// picture's box, with the words beside it at the stage's height on a wide
// screen and under it, filling what's left, on a phone.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const JONAS = "5e1f0000-0000-4000-8000-0000000000b3"

const WEEKLY = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c21"
const QUIET = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c22"
const CLOSED = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c23"
const RETRO = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c24"
const GROUP = "7a1c0000-0000-4000-8000-000000000031"
const NOTES = "d0c00000-0000-4000-8000-000000000041"
const SECTION = "Recordings & notes"

function events() {
  return [
    { event_uuid: WEEKLY, event_title: "Weekly design review", event_start_time: at(21, 8), event_end_time: at(21, 8, 45), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: QUIET, event_title: "Quiet sync", event_start_time: at(21, 11), event_end_time: at(21, 11, 30), event_created_by: ME, event_participants: [MAYA] },
    { event_uuid: CLOSED, event_title: "Board prep", event_start_time: at(21, 14), event_end_time: at(21, 15), event_created_by: MAYA, event_participants: [ME] },
    // Maya's, with Sam a guest she doesn't let change it.
    { event_uuid: RETRO, event_title: "Sprint retro", event_start_time: at(21, 16), event_end_time: at(21, 16, 30), event_created_by: MAYA, event_participants: [ME] },
  ]
}

/** What the calendar kept of each event's calls, newest first. */
const KEPT: Record<string, unknown[]> = {
  [WEEKLY]: [
    // Today's: recorded, with its notes and its recap in the team's group.
    { key: "EG_today", started_at: at(21, 8, 2), ended_at: at(21, 8, 44), lines: 120, notes_doc: NOTES, recap_chat: GROUP, recorded: true },
    // Last week's: not recorded, a transcript of one line, its recap in Maya and Sam's DM.
    { key: "EG_last", started_at: at(14, 8), ended_at: at(14, 8, 30), lines: 1, recap_chat: `${MAYA.user_uuid} ${SAM.user_uuid}`, recorded: false },
    // Before that: recorded, its recap in a DM Sam isn't in, which opens for nobody else.
    { key: "EG_before", started_at: at(7, 8), ended_at: at(7, 8, 20), lines: 0, recap_chat: `${MAYA.user_uuid} ${JONAS}`, recorded: true },
  ],
  [QUIET]: [],
  [RETRO]: [{ key: "EG_retro", started_at: at(14, 16), ended_at: at(14, 16, 25), lines: 30, recorded: true }],
}

/** What each call said, by its key: as many lines as its row counts, Sam and Maya in turn. */
const SAID = ["Let's start with the launch checklist.", "The beta build went out this morning.", "Pricing copy is final; I'll post it after this.", "Can we move the design review to Thursday?"]
const LINES: Record<string, number> = { EG_today: 120, EG_last: 1, EG_retro: 30 }
const wordsOf = (key: string) =>
  Array.from({ length: LINES[key] ?? 0 }, (_, i) => ({
    transcript_from: i % 2 ? { ...MAYA, user_profile_object_key: "" } : { ...ME, user_profile_object_key: "" },
    transcript_text: key === "EG_last" ? "Quick one: the pricing page copy is final." : `${SAID[i % SAID.length]} (${i + 1})`,
    transcript_timestamp: 0,
    transcript_offset_ms: i * 6_000,
  }))

/**
 * The calendar's day as Sam reads it. played: the play routes asked, as
 * "<event> <key>"; read: the transcript pages asked, as "<event> <key> <page>";
 * changed: the deletes and restores, as "delete|restore <event> <key>".
 * ready: calls whose recording is ready to play, at https://media.test/<key>.webm.
 */
async function openDay(page: Page, testInfo: TestInfo, { ready = [] as string[] } = {}) {
  const played: string[] = []
  const read: string[] = []
  const changed: string[] = []
  const deleted = new Set<string>()
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": () => ({ msg: "ok", data: events() }),
    "/event/getEvent/": (url: URL) => ({ msg: "ok", data: events().find((e) => e.event_uuid === url.pathname.split("/").pop()) }),
    "/calendar/events/": (url: URL, request: Request) => {
      const parts = url.pathname.split("/")
      // DELETE /calendar/events/{id}/call/artefacts/{key}, and POST .../restore: Sam organises Weekly.
      const change = request.method() === "DELETE" && parts.at(-2) === "artefacts" ? "delete" : request.method() === "POST" && parts.at(-1) === "restore" && parts.at(-3) === "artefacts" ? "restore" : ""
      if (change) {
        const [id, key] = change === "delete" ? [parts.at(-4) ?? "", decodeURIComponent(parts.at(-1) ?? "")] : [parts.at(-5) ?? "", decodeURIComponent(parts.at(-2) ?? "")]
        changed.push(`${change} ${id} ${key}`)
        if (id !== WEEKLY) return withStatus(403, { msg: "Only the organiser can change this event." })
        if (change === "delete" ? deleted.has(key) : !deleted.has(key)) return withStatus(404, { msg: "There's no such recording on this event." })
        if (change === "delete") deleted.add(key)
        else deleted.delete(key)
        return { msg: change === "delete" ? "The call's recording and transcript were deleted." : "The call's recording and transcript are back." }
      }
      // /calendar/events/{id}/call/artefacts/{key}/recording: the oldest is ready to play; today's is still being
      // recorded; last week's wasn't recorded, so it answers as a transcript alone (httpx.WriteRecordingURL).
      if (parts.at(-1) === "recording" && parts.at(-3) === "artefacts") {
        const key = decodeURIComponent(parts.at(-2) ?? "")
        played.push(`${parts.at(-5)} ${key}`)
        if (ready.includes(key)) return { msg: "ok", data: { status: "ready", url: `https://media.test/${key}.webm` } }
        return { msg: "ok", data: key === "EG_before" ? { status: "ready", url: `https://media.test/${key}.mp4` } : key === "EG_last" ? { status: "transcript_only" } : { status: "recording" } }
      }
      // .../artefacts/{key}/transcript?pageIndex=&pageSize= (head C2): a call's words a page at a time, in the
      // conversation transcript's answer, for whoever may read the event.
      if (parts.at(-1) === "transcript" && parts.at(-3) === "artefacts") {
        const key = decodeURIComponent(parts.at(-2) ?? "")
        const index = Number(url.searchParams.get("pageIndex") ?? "0")
        const size = Number(url.searchParams.get("pageSize") ?? "20")
        read.push(`${parts.at(-5)} ${key} ${index}`)
        const all = wordsOf(key)
        return { msg: "ok", data: { recording_transcript: all.slice(index * size, (index + 1) * size), recording_transcript_count: all.length, recording_transcript_only: key === "EG_last" }, pageCount: Math.ceil(all.length / size) }
      }
      // /calendar/events/{id}/call/artefacts: the calendar's read rule; Board prep's says 404 to Sam.
      if (parts.at(-1) === "artefacts" && parts.at(-2) === "call") {
        const id = parts.at(-3) ?? ""
        if (id === CLOSED) return withStatus(404, { msg: "Event not found" })
        return { msg: "ok", data: (KEPT[id] ?? []).filter((c) => !deleted.has((c as { key: string }).key)) }
      }
      const e = events().find((x) => x.event_uuid === parts.at(-1))
      return { msg: "ok", data: e ? { id: e.event_uuid, title: e.event_title, notes: "", start: { at: e.event_start_time, zone: "Europe/London" }, end: { at: e.event_end_time }, all_day: false, sequence: 1, kind: "event", attendees: [], organiser: { user_uuid: e.event_created_by.user_uuid }, email_on_answers: false } : null }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=day", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${WEEKLY}"]`).first()).toBeVisible({ timeout: 60_000 })
  return { played, read, changed }
}

const card = (page: Page) => page.locator("[data-event-card]")
/**
 * How the player's stage sits round its picture (the video's box, as
 * object-fit: contain draws it), and where its words are: beside it, at its
 * height, on a wide screen; under it, to the sheet's foot, on a phone.
 */
const stageFit = (page: Page, phone: boolean) =>
  page.evaluate((phone) => {
    const video = document.querySelector<HTMLVideoElement>("[role=dialog] video")
    const stage = video?.closest("[data-stage]")?.getBoundingClientRect()
    const words = document.querySelector("[role=dialog] [data-transcript]")?.getBoundingClientRect()
    const sheet = document.querySelector("[role=dialog]")?.getBoundingClientRect()
    if (!video?.videoWidth || !stage || !words || !sheet) return null
    const box = video.getBoundingClientRect()
    const k = Math.min(box.width / video.videoWidth, box.height / video.videoHeight)
    const near = (a: number, b: number) => Math.abs(a - b) <= 2
    return {
      picture: near(stage.width, video.videoWidth * k) && near(stage.height, video.videoHeight * k),
      words: phone ? words.top >= stage.bottom - 2 && near(words.bottom, sheet.bottom) : words.left >= stage.right - 2 && near(words.height, stage.height),
    }
  }, phone)
const toastOf = (page: Page, title: string) => page.locator(".toast-card").filter({ hasText: title })
const listedFor = (page: Page, id: string) => page.waitForResponse((r) => r.url().includes(`/calendar/events/${id}/call/artefacts`), { timeout: 60_000 })

for (const theme of SHOT_THEMES) {
  for (const width of [1280, 390]) {
    const phone = width < 600
    test.describe(`an event's recordings and notes at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 860 }, isMobile: phone, hasTouch: phone, colorScheme: theme })
      const press = async (target: ReturnType<Page["locator"]>) => (phone ? target.tap() : target.click())
      const openDetails = async (page: Page, id: string) => {
        await press(page.locator(`[data-event-uuid="${id}"]`).first())
        await press(card(page).getByRole("button", { name: "Open details" }))
      }

      test("lists the calls it kept, newest first, and plays one by the event's own route", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { played, read } = await openDay(page, testInfo)
        await openDetails(page, WEEKLY)
        const section = page.locator("[data-event-panel]").getByRole("region", { name: SECTION })
        const calls = section.getByRole("listitem")
        await expect(calls).toHaveCount(3, { timeout: 30_000 })

        // Today's: how long it ran, its transcript, Play, its notes and its recap's group.
        await expect(calls.nth(0)).toContainText("42 min")
        await expect(calls.nth(0)).toContainText("Transcript, 120 lines")
        await expect(calls.nth(0).getByRole("link", { name: "Call notes" })).toHaveAttribute("href", `/app/doc/${NOTES}`)
        await expect(calls.nth(0).getByRole("link", { name: "Conversation" })).toHaveAttribute("href", `/app/chat/group/${GROUP}`)
        // Last week's: one line, nothing to play but its words to read (C2), and the DM opens as Sam's with Maya.
        await expect(calls.nth(1)).toContainText("Transcript, 1 line")
        await expect(calls.nth(1)).not.toContainText("1 lines")
        await expect(calls.nth(1).getByRole("button", { name: "Play recording" })).toHaveCount(0)
        await expect(calls.nth(1).getByRole("button", { name: "Read transcript" })).toHaveCount(1)
        await expect(section.getByRole("button", { name: "Read transcript" })).toHaveCount(1)
        await expect(calls.nth(1).getByRole("link", { name: "Conversation" })).toHaveAttribute("href", `/app/chat/${MAYA.user_uuid}`)
        // Before that: a DM Sam isn't in links nowhere.
        await expect(calls.nth(2).getByRole("button", { name: "Play recording" })).toHaveCount(1)
        await expect(calls.nth(2).getByRole("link", { name: "Conversation" })).toHaveCount(0)
        await expect(calls.nth(2)).not.toContainText("Transcript")
        // Every action takes a finger's tap: each is a base control, which
        // app/phone.css (F3) reaches out to 44 px under a coarse pointer.
        // Sam organises it, so each call has its Delete too.
        await expect(section.getByRole("button", { name: "Delete recording" })).toHaveCount(2)
        await expect(calls.nth(1).getByRole("button", { name: "Delete transcript" })).toHaveCount(1)
        const actions = section.locator("a, button")
        await expect(actions).toHaveCount(9)
        for (const b of await actions.all()) await expect(b).toHaveAttribute("data-touch-target", "")
        if (phone) {
          await calls.nth(0).scrollIntoViewIfNeeded()
          for (const b of await calls.nth(0).locator("a, button").all()) expect(await takesAFinger(b, calls.nth(0))).toBe(true)
        }
        await reviewShot(page, "event-recordings", theme)

        await press(calls.nth(0).getByRole("button", { name: "Play recording" }))
        const player = page.getByRole("dialog")
        await expect(player.getByText("Still recording")).toBeVisible({ timeout: 30_000 })
        await expect(player).toContainText("Weekly design review recording")
        // Head C2: its words come by the event's own transcript route, first page first, in the
        // Transcript panel beside the recording, as the row's "Transcript, 120 lines" says.
        await expect(player.locator("[data-transcript]")).toContainText(SAID[0], { timeout: 30_000 })
        await expect(player.getByText("No transcript available")).toHaveCount(0)
        expect(played).toEqual([`${WEEKLY} EG_today`])
        expect(read[0]).toBe(`${WEEKLY} EG_today 0`)
        expect(read.every((r) => r.startsWith(`${WEEKLY} EG_today `))).toBe(true)
        await reviewShot(page, "event-recording-player", theme)
      })

      test("plays a ready recording with its Download in the sheet's head", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { played, read } = await openDay(page, testInfo)
        // The file never answers: the stage keeps loading, and nothing asks for a fresh link.
        await page.route("https://media.test/**", () => {})
        await openDetails(page, WEEKLY)
        const calls = page.locator("[data-event-panel]").getByRole("region", { name: SECTION }).getByRole("listitem")
        await press(calls.nth(2).getByRole("button", { name: "Play recording" }))
        const player = page.getByRole("dialog")
        await expect(player).toContainText("Weekly design review recording", { timeout: 30_000 })
        await expect(player.locator("[data-transcript]")).toHaveCount(0)
        if (phone) {
          // The panel that held a phone's Download isn't there, so it sits in the sheet's head, beside Close.
          const download = player.getByRole("button", { name: "Download recording" })
          await expect(download).toBeVisible({ timeout: 30_000 })
          expect(await takesAFinger(download)).toBe(true)
        } else {
          await expect(player.getByRole("button", { name: "Download", exact: true })).toBeVisible({ timeout: 30_000 })
          await expect(player.getByRole("button", { name: "Download recording" })).toHaveCount(0)
        }
        expect(played).toEqual([`${WEEKLY} EG_before`])
        // It kept no words, so nothing asks for them.
        expect(read).toEqual([])
        await reviewShot(page, "event-recording-ready", theme)
      })

      test("puts a real recording on a stage that is its picture's box, its words beside it or under it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo, { ready: ["EG_today"] })
        // Today's call, recorded 16:9 as a call's room is, and its 120 lines.
        const video = await recordedVideo(page, 1280, 720)
        await page.route("https://media.test/**", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: video }))
        await openDetails(page, WEEKLY)
        const calls = page.locator("[data-event-panel]").getByRole("region", { name: SECTION }).getByRole("listitem")
        await press(calls.nth(0).getByRole("button", { name: "Play recording" }))
        const player = page.getByRole("dialog")
        await expect(player.locator("[data-transcript]")).toContainText(SAID[0], { timeout: 30_000 })
        await expect.poll(() => player.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBe(1280)
        await expect
          .poll(() => stageFit(page, phone), { message: "the stage is the picture's box, the words beside or under it", timeout: 10_000 })
          .toEqual({ picture: true, words: true })
        // V-189: beside its words a recording's Download is still the sheet's own, in its head beside Close,
        // never an icon on the Transcript row that reads as the transcript's.
        const close = player.getByRole("button", { name: "Close", exact: true })
        if (phone) {
          const download = player.getByRole("button", { name: "Download recording" })
          await expect(download).toBeVisible({ timeout: 30_000 })
          await expect(player.locator("[data-transcript]").getByRole("button", { name: "Download recording" })).toHaveCount(0)
          expect(await download.evaluate((b, c) => !!b.parentElement?.contains(c), await close.elementHandle())).toBe(true)
          expect(await takesAFinger(download)).toBe(true)
        } else {
          await expect(player.getByRole("button", { name: "Download", exact: true })).toBeVisible({ timeout: 30_000 })
          await expect(player.getByRole("button", { name: "Download recording" })).toHaveCount(0)
        }
        await reviewShot(page, "event-recording-fit", theme)
      })

      test("reads a call that wasn't recorded by its transcript, in the same player", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { played, read } = await openDay(page, testInfo)
        await openDetails(page, WEEKLY)
        const calls = page.locator("[data-event-panel]").getByRole("region", { name: SECTION }).getByRole("listitem")
        await press(calls.nth(1).getByRole("button", { name: "Read transcript" }))
        const player = page.getByRole("dialog")
        await expect(player).toContainText("Weekly design review transcript", { timeout: 30_000 })
        await expect(player.getByText("Transcript · this call wasn't recorded")).toBeVisible({ timeout: 30_000 })
        await expect(player.locator("[data-transcript]")).toContainText("Quick one: the pricing page copy is final.", { timeout: 30_000 })
        // No stage: there is no picture to wait for.
        await expect(player.locator("video")).toHaveCount(0)
        await expect(player.getByText("Still recording")).toHaveCount(0)
        expect(played).toEqual([`${WEEKLY} EG_last`])
        expect(read).toEqual([`${WEEKLY} EG_last 0`])
        await reviewShot(page, "event-transcript-read", theme)
      })

      // DB-61's MUST 1 (head C's LIVE look): beside the calendar, the event's side panel closes when a
      // call's Conversation leaves it, so the chat gets the page instead of a column beside the panel.
      test("opens a call's conversation on the page, the event's side panel closing behind it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        await openDetails(page, WEEKLY)
        const calls = page.locator("[data-event-panel]").getByRole("region", { name: SECTION }).getByRole("listitem")
        await expect(calls).toHaveCount(3, { timeout: 30_000 })
        await press(calls.nth(0).getByRole("link", { name: "Conversation" }))
        await page.waitForURL(`**/app/chat/group/${GROUP}`, { timeout: 60_000 })
        await expect(page.locator("[data-event-panel]")).toHaveCount(0, { timeout: 30_000 })
      })

      test("deletes a call's recording and transcript for whoever may change the event, and Undo brings it back", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { changed } = await openDay(page, testInfo)
        await openDetails(page, WEEKLY)
        const section = page.locator("[data-event-panel]").getByRole("region", { name: SECTION })
        const calls = section.getByRole("listitem")
        await expect(calls).toHaveCount(3, { timeout: 30_000 })
        const del = calls.nth(0).getByRole("button", { name: "Delete recording" })
        if (phone) {
          await calls.nth(0).scrollIntoViewIfNeeded()
          expect(await takesAFinger(del, calls.nth(0))).toBe(true)
        }
        await press(del)
        // It leaves the list at once, and the toast offers it back.
        await expect(calls).toHaveCount(2)
        await expect(section).not.toContainText("42 min")
        const offered = toastOf(page, "Deleted recording")
        await expect(offered).toContainText("42 min", { timeout: 30_000 })
        expect(changed).toEqual([`delete ${WEEKLY} EG_today`])
        await reviewShot(page, "event-recording-deleted", theme)
        await press(offered.getByRole("button", { name: "Undo" }))
        await expect(toastOf(page, "Undone")).toBeVisible({ timeout: 30_000 })
        await expect(calls).toHaveCount(3, { timeout: 30_000 })
        await expect(calls.nth(0)).toContainText("42 min")
        await expect(calls.nth(0).getByRole("button", { name: "Play recording" })).toHaveCount(1)
        expect(changed).toEqual([`delete ${WEEKLY} EG_today`, `restore ${WEEKLY} EG_today`])
      })

      test("plays a call's recording for a guest who may only read the event, with no Delete", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { played, changed } = await openDay(page, testInfo)
        await openDetails(page, RETRO)
        const section = page.locator("[data-event-panel]").getByRole("region", { name: SECTION })
        const calls = section.getByRole("listitem")
        await expect(calls).toHaveCount(1, { timeout: 30_000 })
        await expect(calls.nth(0).getByRole("button", { name: "Play recording" })).toHaveCount(1)
        await expect(section.getByRole("button", { name: /^Delete / })).toHaveCount(0)
        await press(calls.nth(0).getByRole("button", { name: "Play recording" }))
        await expect(page.getByRole("dialog")).toContainText("Sprint retro recording", { timeout: 30_000 })
        expect(played).toEqual([`${RETRO} EG_retro`])
        expect(changed).toEqual([])
      })

      test("shows nothing for an event that kept nothing", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        const listed = listedFor(page, QUIET)
        await openDetails(page, QUIET)
        expect((await listed).status()).toBe(200)
        await expect(page.locator("[data-event-panel]")).toContainText("Quiet sync", { timeout: 30_000 })
        await expect(page.getByRole("region", { name: SECTION })).toHaveCount(0)
      })

      test("shows nothing, and says nothing, when the calendar won't open its calls to the reader", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openDay(page, testInfo)
        const listed = listedFor(page, CLOSED)
        await openDetails(page, CLOSED)
        expect((await listed).status()).toBe(404)
        await expect(page.locator("[data-event-panel]")).toContainText("Board prep", { timeout: 30_000 })
        await expect(page.getByRole("region", { name: SECTION })).toHaveCount(0)
        await expect(page.getByText("Event not found")).toHaveCount(0)
      })
    })
  }
}
