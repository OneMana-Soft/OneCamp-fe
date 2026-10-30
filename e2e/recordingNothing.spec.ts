import { expect, test } from "@playwright/test"

import { reviewShot, stubBackend, withStatus } from "./stubbedApp"

// V-32: a recording with nothing to play says why, in the recordings list and in the player. A call's recorder starts
// on the first picture or sound. LiveKit aborts one stopped before anything came through ("Start signal not
// received": every camera off and every microphone muted, or stopped within seconds), and the server calls it
// "empty". That reads calmly, as nothing recorded. One that broke ("failed") still says it couldn't be saved.
// Neither offers Play. These are the real pages, on a backend stubbed with the server's answers. With SHOTS_DIR set,
// the list and both players are shot.
// DB-28's should-fixes: the player's header gives no size for one with nothing in it ("0 bytes" before), as its row
// gives none, and with nothing to read either, the stage says why on its own: an empty Transcript panel took half the
// phone sheet beside it. A failed recording whose call was transcribed keeps its words.
// DB-29's must: that sheet lays out once. Which it is isn't known until the transcript answers, so the stage keeps its
// loading state until then: deciding early drew the message full width, then moved it when the words came. A
// transcript that didn't load keeps its panel, which says so with Try again, so the words don't vanish.
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const CH = { ch_uuid: "0c4a0000-0000-4000-8000-0000000000e1", ch_name: "launch" }
const part = (id: string, status: string, minutesAgo: number, seconds: number, size: number) => ({
  recording_egress_id: id,
  recording_stared_at: ago(minutesAgo),
  recording_ended_at: ago(minutesAgo - 1),
  recording_duration: seconds,
  recording_obj_key: `recordings/${CH.ch_uuid}/${id}.mp4`,
  recording_transcript: [],
  recording_size: size,
  recording_started_by: MAYA,
  recording_channel: CH,
  recording_status: status,
})
const line = (text: string, seconds: number) => ({ transcript_from: MAYA, transcript_text: text, transcript_timestamp: 0, transcript_offset_ms: seconds * 1000 })
const WORDS = {
  msg: "ok",
  data: { recording_transcript: [line("Let's ship the beta on Friday.", 4), line("I'll write the notes.", 9)], transcript_count: 2 },
  pageCount: 1,
}
const failedOnly = (id: string) => ({ msg: "ok", data: { recordings: [part(id, "failed", 45, 0, 0)], has_more: false } })

for (const [width, height, phone] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`a recording with nothing to play at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("the list says which and offers no Play, and the player says why", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, {
          "/user/recordingList": {
            msg: "ok",
            data: {
              recordings: [part("EG_ready0001", "ready", 30, 1500, 52_428_800), part("EG_empty0001", "empty", 60, 0, 0), part("EG_fail00001", "failed", 90, 0, 0)],
              has_more: false,
            },
          },
          [`/getRecordingURL/${CH.ch_uuid}/EG_empty0001`]: { status: "empty" },
          [`/getRecordingURL/${CH.ch_uuid}/EG_fail00001`]: { status: "failed" },
          "/getRecordingTranscript/": { msg: "ok", data: { recording_transcript: [], transcript_count: 0 }, pageCount: 0 },
        })
        await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const rows = page.locator("[data-recording-row]")
        await expect(rows).toHaveCount(3, { timeout: 60_000 })
        const ready = rows.filter({ hasText: "50 MB" })
        const empty = rows.filter({ hasText: "Nothing recorded" })
        const failed = rows.filter({ hasText: "Couldn't be saved" })
        await expect(empty).toHaveCount(1)
        await expect(failed).toHaveCount(1)
        await expect(empty.locator('[data-thumb-nothing="empty"]')).toHaveCount(1)
        await expect(failed.locator('[data-thumb-nothing="failed"]')).toHaveCount(1)
        await expect(ready.locator("[data-thumb-play]")).toHaveCount(1)
        // Neither offers Play; each offers See why, where rows have tools. (This page offers no Delete for any
        // recording: a channel's or chat's own list does.)
        for (const row of [empty, failed]) await expect(row.getByRole("button", { name: "Play", exact: true })).toHaveCount(0)
        if (!phone) for (const row of [empty, failed]) await expect(row.getByRole("button", { name: "See why", exact: true })).toHaveCount(1)
        // Every row keeps its time in one column, with tools or without.
        const ends = await rows.locator(".hub-row-meta").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().right)))
        expect(new Set(ends).size, `the times end at ${ends.join(", ")}`).toBe(1)
        // A computer's row offers its tools on hover; a phone's row plays at a tap and shows no tools for any recording.
        if (!phone) await expect(ready.getByRole("button", { name: "Play", exact: true })).toHaveCount(1)
        await reviewShot(page, `recordings-nothing-list-${width}`, theme)

        for (const [row, state, title] of [
          [empty, "empty", "Nothing was recorded"],
          [failed, "failed", "This recording couldn't be saved"],
        ] as const) {
          if (phone) await row.tap()
          else await row.click()
          const stage = page.locator(`[data-recording-state="${state}"]`)
          await expect(stage).toBeVisible({ timeout: 60_000 })
          await expect(stage.getByText(title, { exact: true })).toBeVisible()
          await expect(page.locator("video")).toHaveCount(0)
          const player = page.getByRole("dialog")
          await expect(player.getByText(/\d bytes?\b/), "no size in the header for one with nothing in it").toHaveCount(0)
          await expect(player.locator("[data-transcript]"), "no Transcript panel beside nothing to play and nothing to read").toHaveCount(0)
          // The stage sits flush under the header: the dialog's own gap left a band of its colour between them.
          // Flush is within half a pixel either way (a stage a hair above rounded to -0, which toBe(0) refused).
          const band = await stage.evaluate((el) => {
            const head = el.closest('[role="dialog"]')?.firstElementChild?.getBoundingClientRect()
            const box = el.closest(".bg-black")?.getBoundingClientRect()
            return head && box ? Math.abs(box.top - head.bottom) : Infinity
          })
          expect(band, "the stage sits flush under the header").toBeLessThan(0.5)
          await reviewShot(page, `recordings-nothing-player-${state}-${width}`, theme)
          await page.keyboard.press("Escape")
          await expect(stage).toHaveCount(0)
        }
        await expect(page.getByText("Nothing was recorded")).toHaveCount(0)
      })

      test("a failed recording whose call was transcribed keeps its words beside the stage", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, {
          "/user/recordingList": failedOnly("EG_fail00002"),
          [`/getRecordingURL/${CH.ch_uuid}/EG_fail00002`]: { status: "failed" },
          "/getRecordingTranscript/": WORDS,
        })
        await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = page.locator("[data-recording-row]").filter({ hasText: "Couldn't be saved" })
        await expect(row).toHaveCount(1, { timeout: 60_000 })
        if (phone) await row.tap()
        else await row.click()
        const player = page.getByRole("dialog")
        await expect(player.locator('[data-recording-state="failed"]')).toBeVisible({ timeout: 60_000 })
        const panel = player.locator("[data-transcript]")
        await expect(panel).toBeVisible()
        await expect(player.getByText("I'll write the notes.", { exact: true })).toBeVisible()
        await expect(player.getByText(/\d bytes?\b/)).toHaveCount(0)
        // The rows' words start on the heading's line (DB-29: 5 px right of it before).
        const starts = await panel.evaluate((el) => {
          const left = (n: Element | null | undefined) => Math.round(n?.getBoundingClientRect().left ?? -1)
          return { heading: left(el.firstElementChild?.querySelector("span")), words: left([...el.querySelectorAll("p")].find((p) => p.textContent === "I'll write the notes.")) }
        })
        expect(starts.words, `the words start at ${starts.words}, the heading at ${starts.heading}`).toBe(starts.heading)
        await reviewShot(page, `recordings-nothing-player-failed-words-${width}`, theme)
      })

      test("a failed recording whose call was transcribed lays out once: the stage waits for its words", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        let answerWords!: () => void
        const wordsLetGo = new Promise<void>((resolve) => (answerWords = resolve))
        await stubBackend(page, testInfo, {
          "/user/recordingList": failedOnly("EG_fail00003"),
          [`/getRecordingURL/${CH.ch_uuid}/EG_fail00003`]: { status: "failed" },
          // The media answers at once; the words wait for the test.
          "/getRecordingTranscript/": async () => {
            await wordsLetGo
            return WORDS
          },
        })
        await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = page.locator("[data-recording-row]").filter({ hasText: "Couldn't be saved" })
        await expect(row).toHaveCount(1, { timeout: 60_000 })
        const mediaAnswered = page.waitForResponse((r) => r.url().includes("/getRecordingURL/"), { timeout: 60_000 })
        if (phone) await row.tap()
        else await row.click()
        await mediaAnswered
        const player = page.getByRole("dialog")
        // While the words are held: the stage's loading state, no message and no panel.
        await expect(player.locator('[data-recording-state="loading"]')).toBeVisible({ timeout: 60_000 })
        await expect(player.getByText("Loading the recording…", { exact: true })).toBeVisible()
        await expect(player.locator('[data-recording-state="failed"]')).toHaveCount(0)
        await expect(player.locator("[data-transcript]")).toHaveCount(0)
        await reviewShot(page, `recordings-nothing-player-held-${width}`, theme)
        // Every frame from here on, until the message and the panel are both up.
        await page.evaluate(() => {
          const seen: string[] = []
          ;(window as unknown as { __layouts: string[] }).__layouts = seen
          const frame = () => {
            const message = !!document.querySelector('[data-recording-state="failed"]')
            const panel = !!document.querySelector("[data-transcript]")
            seen.push(`${message ? "message" : "-"} ${panel ? "panel" : "-"}`)
            if (!(message && panel)) requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        })
        answerWords()
        await expect(player.locator('[data-recording-state="failed"]')).toBeVisible({ timeout: 60_000 })
        await expect(player.locator("[data-transcript]")).toBeVisible()
        await expect(player.getByText("I'll write the notes.", { exact: true })).toBeVisible()
        const layouts = await page.evaluate(() => (window as unknown as { __layouts: string[] }).__layouts)
        expect(layouts.filter((l) => l === "message -"), `frames: ${[...new Set(layouts)].join(" | ")}`).toEqual([])
      })

      test("a transcript that didn't load says so beside a failed recording, and Try again brings its words", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        let failing = true
        await stubBackend(page, testInfo, {
          "/user/recordingList": failedOnly("EG_fail00004"),
          [`/getRecordingURL/${CH.ch_uuid}/EG_fail00004`]: { status: "failed" },
          "/getRecordingTranscript/": () => (failing ? withStatus(500, { msg: "internal error" }) : WORDS),
        })
        await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = page.locator("[data-recording-row]").filter({ hasText: "Couldn't be saved" })
        await expect(row).toHaveCount(1, { timeout: 60_000 })
        if (phone) await row.tap()
        else await row.click()
        const player = page.getByRole("dialog")
        await expect(player.locator('[data-recording-state="failed"]')).toBeVisible({ timeout: 60_000 })
        const panel = player.locator("[data-transcript]")
        await expect(panel.getByText("Couldn't load the transcript", { exact: true })).toBeVisible()
        await expect(panel.getByText("No transcript available")).toHaveCount(0)
        await reviewShot(page, `recordings-nothing-player-transcript-error-${width}`, theme)
        failing = false
        const again = panel.getByRole("button", { name: "Try again" })
        if (phone) await again.tap()
        else await again.click()
        await expect(panel.getByText("I'll write the notes.", { exact: true })).toBeVisible({ timeout: 60_000 })
        await expect(panel.getByText("Couldn't load the transcript", { exact: true })).toHaveCount(0)
      })
    })
  }
}
