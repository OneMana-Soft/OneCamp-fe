import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, reviewShot, reviewShotInThemes, stubBackend, withStatus } from "./stubbedApp"

// zoom-13: what was said in a call is found by the one search, and a hit opens the one player at its moment.
// The server answers a call's line as a "transcript" hit carrying the call's place, its recording (the egress id, or
// the call's key when nobody recorded it) and where in it the line was said. The row is a link to the conversation's
// recordings page with that moment in its address (?play=&at=, and media=0 for a call with no recording); the page
// opens the player there: the line said then marked, and a recording's picture started at it. A call nobody recorded
// opens on its words alone and never asks for a picture. These are the real pages on a backend stubbed with the
// server's answers. With SHOTS_DIR set, the row, its Actions drawer on a phone, the player at its moment and the call with no recording are shot.
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const CH = { ch_uuid: "0c4a0000-0000-4000-8000-0000000000e1", ch_name: "launch" }
const STARTED = Math.floor(Date.now() / 1000) - 2 * 86_400
const RECORDED = "EG_moment0001"
const UNRECORDED = "call-launch-0002"

const hit = (n: number, text: string, marked: string, recording: string, atMs: number, media: boolean) => ({
  type: "transcript",
  transcript: {
    transcript_id: `tr-${n}`,
    transcript_text: text,
    transcript_offset_ms: atMs,
    transcript_recording_id: recording,
    transcript_has_media: media,
    transcript_conv_id: CH.ch_uuid,
    transcript_conv_kind: "channel",
    transcript_by_user_id: MAYA.user_uuid,
    transcript_by_user_full_name: MAYA.user_full_name,
    transcript_call_started_at: STARTED,
    created_date: STARTED + atMs / 1000,
    deleted_date: 0,
  },
  highlight: { transcript_text: [marked] },
})
const SAID = hit(1, "Let's ship the beta on Friday.", "Let's ship the <mark>beta</mark> on Friday.", RECORDED, 6_000, true)
const UNSAID = hit(2, "The beta notes go out Monday.", "The <mark>beta</mark> notes go out Monday.", UNRECORDED, 10_000, false)
const SEARCH = {
  data: { page: [SAID, UNSAID], totals: { transcript: 2 }, total: 2, has_more: false, notes: [], query: { runs: true, issues: [], text: "beta" } },
}

const line = (text: string, seconds: number) => ({ transcript_from: MAYA, transcript_text: text, transcript_timestamp: 0, transcript_offset_ms: seconds * 1000 })
const WORDS = {
  msg: "ok",
  data: {
    recording_transcript: [line("Morning, everyone.", 1), line("Let's ship the beta on Friday.", 6), line("The beta notes go out Monday.", 10)],
    transcript_count: 3,
    // The server sends the recording's start with its words: the player's title, date and download name read it.
    recording_stared_at: new Date(STARTED * 1000).toISOString(),
  },
  pageCount: 1,
}
const LISTED = {
  recording_egress_id: RECORDED,
  recording_stared_at: new Date(STARTED * 1000).toISOString(),
  recording_ended_at: new Date((STARTED + 12) * 1000).toISOString(),
  recording_duration: 12,
  recording_obj_key: `recordings/${CH.ch_uuid}/${RECORDED}.wav`,
  recording_transcript: [],
  recording_size: 192_044,
  recording_started_by: MAYA,
  recording_channel: CH,
  recording_status: "ready",
}

/** Twelve seconds of silence as 16-bit PCM WAV: its length is in its header, so the player can start it anywhere. */
function silence(seconds: number): Buffer {
  const rate = 8_000
  const data = rate * 2 * seconds
  const b = Buffer.alloc(44 + data)
  b.write("RIFF", 0)
  b.writeUInt32LE(36 + data, 4)
  b.write("WAVEfmt ", 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write("data", 36)
  b.writeUInt32LE(data, 40)
  return b
}
const AUDIO = silence(12)

type Opened = { media: string[]; transcript: string[] }

// The recording's answer: a link to play, unless a test refuses it.
const PLAYABLE = { msg: "ok", data: { status: "ready", url: `https://media.test/${RECORDED}.wav` } }

async function open(page: Page, testInfo: TestInfo, theme: string, transcript: unknown = WORDS, recording: unknown = PLAYABLE): Promise<Opened> {
  const opened: Opened = { media: [], transcript: [] }
  await page.addInitScript((t) => {
    // The first load's theme only: this runs on every load, so a theme the test picks later survives its reload
    // (a reload once put "light" back, and the 1280 dark frame came out light: CR-330 F4). "system" follows the
    // emulated scheme, so reviewShotInThemes shoots every frame light and dark as it stands (CR-330 F3).
    if (localStorage.getItem("ui-theme") === null) localStorage.setItem("ui-theme", t)
    // What Copy link wrote, read back without the browser's clipboard permission.
    const w = window as unknown as { __copied: string[] }
    w.__copied = []
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (s: string) => void w.__copied.push(s), readText: async () => w.__copied.at(-1) ?? "" },
    })
  }, theme)
  await stubBackend(page, testInfo, {
    "/query/search": SEARCH,
    // #launch is in this person's sidebar, so the row names the place the call was in, as people will see it.
    "/user/sidebarNav": {
      msg: "ok",
      data: { ...SAM, user_channels: [{ ...CH, ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false, unread_post_count: 0 }], user_dms: [], user_projects: [] },
    },
    "/people/who-knows/me": { data: { listed: true } },
    "/people/who-knows": { data: { query: "beta", considered: 0, you_hidden: false, people: [] } },
    "/ch/channelBasicInfo/": { msg: "ok", channel_info: { ch_uuid: CH.ch_uuid, ch_name: CH.ch_name, ch_is_admin: false } },
    "/ch/getRecordingList/": { msg: "ok", channel_info: { recordings: [LISTED], has_more: false, is_member: 1 } },
    "/getRecordingURL/": (url: URL) => {
      opened.media.push(url.pathname)
      return recording
    },
    "/getRecordingTranscript/": (url: URL) => {
      opened.transcript.push(url.pathname)
      return transcript
    },
  })
  // The recording, served a range at a time as a store serves one, so the player can start it at the moment.
  await page.route("https://media.test/**", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()["range"] ?? "")
    const headers = { "accept-ranges": "bytes", "access-control-allow-origin": "*" }
    if (!range) return route.fulfill({ status: 200, contentType: "audio/wav", headers, body: AUDIO })
    const start = Number(range[1])
    const end = range[2] ? Math.min(Number(range[2]), AUDIO.length - 1) : AUDIO.length - 1
    return route.fulfill({
      status: 206,
      contentType: "audio/wav",
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${AUDIO.length}` },
      body: AUDIO.subarray(start, end + 1),
    })
  })
  await page.goto("/app/search?query=beta", { waitUntil: "domcontentloaded", timeout: 120_000 })
  return opened
}

const calls = (page: Page) => page.locator("[data-search-results] [data-search-group=calls]")
const rowOf = (page: Page, text: string) => calls(page).locator("[data-search-row=transcript]").filter({ hasText: text })
const momentHref = (recording: string, atMs: number, media: boolean) =>
  `/app/channel/${CH.ch_uuid}/recording?play=${recording}&at=${atMs}${media ? "" : "&media=0"}`
const player = (page: Page) => page.getByRole("dialog")

for (const [width, height, phone] of [
  [1280, 860, false],
  [390, 844, true],
] as const) {
  const press = (l: Locator) => (phone ? l.tap() : l.click())

  test.describe(`a call's line found by search at ${width}`, () => {
    test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone, contextOptions: { reducedMotion: "reduce" } })

    test("the Calls group shows the line, Copy link copies its moment, and the row opens the player there", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const opened = await open(page, testInfo, "system")
      const group = calls(page)
      await expect(group.getByRole("heading", { name: /Calls/ })).toBeVisible({ timeout: 60_000 })
      const row = rowOf(page, "ship the beta")
      await expect(row).toHaveCount(1)
      await expect(row.locator("mark").first()).toHaveText("beta")
      // The speaker's face leads it, as a message's does; the call and its moment follow the words.
      await expect(row.locator("[data-search-lead=message]")).toContainText("MC")
      await expect(row.locator("[data-hub-second]")).toHaveText(/^Call · #launch · Maya Chen · [^·]+$/)
      // The moment is the row's end, never cut off by a long line: whole and inside the row at 390 and 1280 (CR-330 G1).
      const moment = row.locator(".hub-row-meta")
      await expect(moment).toHaveText("at 0:06")
      await expect(moment).toBeVisible()
      expect(
        await moment.evaluate((m) => {
          const r = m.getBoundingClientRect()
          const b = (m.closest("[data-search-row]") as HTMLElement).getBoundingClientRect()
          return m.scrollWidth <= m.clientWidth && r.width > 0 && r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom
        }),
      ).toBe(true)
      await expect(row.getByRole("link", { name: /Maya Chen$/ })).toHaveCount(1)
      const link = row.locator("a[data-search-result]")
      await expect(link).toHaveAttribute("href", momentHref(RECORDED, 6_000, true))
      await reviewShotInThemes(page, `search-call-row-${width}`)

      // Copy link: the row's tools on hover; on a phone, its Actions open one drawer of them (ui/hubRowDrawer).
      if (phone) {
        await rowOf(page, "ship the beta").getByRole("button", { name: "Actions" }).tap()
        await expect(page.getByRole("menu").getByRole("menuitem", { name: "Copy link", exact: true })).toBeVisible()
        await reviewShotInThemes(page, `search-call-actions-${width}`)
        await press(page.getByRole("menu").getByRole("menuitem", { name: "Copy link", exact: true }))
      } else {
        await rowOf(page, "ship the beta").hover()
        await press(rowOf(page, "ship the beta").getByRole("button", { name: "Copy link" }))
      }
      const origin = new URL(page.url()).origin
      await expect.poll(() => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1))).toBe(origin + momentHref(RECORDED, 6_000, true))
      if (phone) await expect(page.getByRole("menu")).toHaveCount(0)

      await press(rowOf(page, "ship the beta").locator("a[data-search-result]"))
      await expect(page).toHaveURL(new RegExp(`/app/channel/${CH.ch_uuid}/recording`), { timeout: 60_000 })
      const dialog = player(page)
      await expect(dialog.locator('[aria-current="true"]')).toContainText("Let's ship the beta on Friday.", { timeout: 60_000 })
      const media = dialog.locator("video")
      await expect.poll(() => media.evaluate((v: HTMLVideoElement) => Math.abs(v.currentTime - 6)), { timeout: 30_000 }).toBeLessThan(1)
      expect(opened.media.some((p) => p.endsWith(`/${RECORDED}`))).toBe(true)
      await expect(dialog.getByRole("heading", { name: /^Recording \d{4}-\d{2}-\d{2} \d{2}\.\d{2}/ })).toBeVisible()
      // The moment's line was already in view, so the list didn't move: line 1's speaker isn't clipped (CR-330 F5).
      await expect(dialog.locator("[data-transcript]").getByText("Maya Chen").first()).toBeInViewport({ ratio: 1 })
      await reviewShotInThemes(page, `search-call-player-${width}`)

      // The moment opens once: closing the player takes it out of the address.
      await dialog.getByRole("button", { name: "Close" }).click()
      await expect(page).not.toHaveURL(/[?&]play=/)
      await expect(dialog).toHaveCount(0)
      // A player a link opened has no row that opened it: focus goes to its recording's row (CR-330 F3), to the control
      // a Tab would reach (a mouse's screen hides the row's touch-only Actions).
      await expect(page.locator(`[data-recording-id="${RECORDED}"]`).locator("button:visible, a[href]:visible").first()).toBeFocused()
      if (!phone) await reviewShotInThemes(page, `search-call-closed-${width}`)
    })

    test("a call nobody recorded opens on its words at the line, asking for no picture", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const opened = await open(page, testInfo, "system")
      const row = rowOf(page, "notes go out Monday")
      await expect(row).toHaveCount(1, { timeout: 60_000 })
      const link = row.locator("a[data-search-result]")
      await expect(link).toHaveAttribute("href", momentHref(UNRECORDED, 10_000, false))
      // The row is a link: Enter opens it from the keyboard, a tap on a phone.
      if (phone) await link.tap()
      else {
        await link.focus()
        await page.keyboard.press("Enter")
      }
      await expect(page).toHaveURL(/[?&]media=0/, { timeout: 60_000 })
      const dialog = player(page)
      await expect(dialog.locator('[aria-current="true"]')).toContainText("The beta notes go out Monday.", { timeout: 60_000 })
      await expect(dialog.locator("video")).toHaveCount(0)
      expect(opened.transcript.some((p) => p.endsWith(`/${UNRECORDED}`))).toBe(true)
      expect(opened.media).toEqual([])
      if (phone) await reviewShotInThemes(page, `search-call-unrecorded-${width}`)
    })

    test("a call this person can't see opens the player's not-available state, never its words", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await open(page, testInfo, "system", withStatus(403, { msg: "not a member" }))
      await page.goto(momentHref(UNRECORDED, 10_000, false), { waitUntil: "domcontentloaded", timeout: 120_000 })
      const dialog = player(page)
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      // It is there and not theirs to see: the house's words, with no Try again, which can't fix it (CR-330 F2).
      await expect(dialog.getByText("You can't see this call")).toBeVisible({ timeout: 30_000 })
      await expect(dialog.getByRole("button", { name: /try again/i })).toHaveCount(0)
      // Nothing about a recording: the link's media=0 says nothing about a call this person can't see.
      await expect(dialog.locator("[data-transcript]")).not.toContainText(/record/i)
      await expect(dialog).not.toContainText("The beta notes go out Monday.")
      await reviewShotInThemes(page, `search-call-denied-${width}`)
    })

    // V-1075: a moment link shared with someone the recording isn't shared with. The words answer, the recording is
    // refused: the stage says so in the house's shared words, never "Couldn't load the recording" with a Try again
    // that can't fix it. V-1104: the words beside it read, so it is the recording that can't be seen, not the call.
    test("a recording this person can't see says so on the stage, with no Try again", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const opened = await open(page, testInfo, "system", WORDS, withStatus(403, { msg: "not a member" }))
      await page.goto(momentHref(RECORDED, 6_000, true), { waitUntil: "domcontentloaded", timeout: 120_000 })
      const dialog = player(page)
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      const stage = dialog.locator("[data-stage]")
      await expect(stage.locator("[data-recording-state=no-access]")).toBeVisible({ timeout: 30_000 })
      await expect(stage.getByText("You can't see this recording")).toBeVisible()
      await expect(dialog.getByText("You can't see this call")).toHaveCount(0)
      await expect(stage).not.toContainText("Couldn't load the recording")
      await expect(dialog.getByRole("button", { name: /try again/i })).toHaveCount(0)
      await expect(stage.locator("video")).toHaveCount(0)
      // It asked for the recording and was refused; the words beside it still read.
      expect(opened.media.length).toBeGreaterThan(0)
      await expect(dialog.locator("[data-transcript]")).toContainText("Let's ship the beta on Friday.")
      // The words fit the stage at either width: nothing cut off above or below.
      const fits = await stage.evaluate((s) => {
        const b = s.getBoundingClientRect()
        const r = s.querySelector("[data-recording-state]")!.getBoundingClientRect()
        return r.top >= b.top && r.bottom <= b.bottom && r.left >= b.left && r.right <= b.right
      })
      expect(fits).toBe(true)
      await reviewShotInThemes(page, "search-call-stage-denied")
    })

    // V-1075 fix 1: the common case. Someone the call isn't shared with opens its moment link, and both reads follow
    // the same membership rule: the words and the recording are both refused. The stage alone says it, once.
    test("a call refused on both sides says it once, on the stage alone", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const denied = withStatus(403, { msg: "not a member" })
      const opened = await open(page, testInfo, "system", denied, denied)
      await page.goto(momentHref(RECORDED, 6_000, true), { waitUntil: "domcontentloaded", timeout: 120_000 })
      const dialog = player(page)
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      await expect(dialog.locator("[data-stage] [data-recording-state=no-access]")).toBeVisible({ timeout: 30_000 })
      // Both were asked, and both refused.
      await expect.poll(() => opened.transcript.length, { timeout: 30_000 }).toBeGreaterThan(0)
      expect(opened.media.length).toBeGreaterThan(0)
      await expect(dialog.getByText("You can't see this call")).toHaveCount(1)
      await expect(dialog.locator("[data-transcript]")).toHaveCount(0)
      await expect(dialog.getByText("Transcript", { exact: true })).toHaveCount(0)
      await expect(dialog).not.toContainText("Couldn't load the recording")
      await expect(dialog.getByRole("button", { name: /try again/i })).toHaveCount(0)
      await page.emulateMedia({ colorScheme: "light" })
      await reviewShot(page, "search-call-both-denied", "light")
      // Still once after the page has settled for its shot.
      await expect(dialog.getByText("You can't see this call")).toHaveCount(1)
    })
  })
}
