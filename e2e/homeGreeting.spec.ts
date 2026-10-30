import { expect, test, type Page } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// Home's greeting and its line under it (design-01, DESIGN-BUILD-9, 23 Oct
// 2026): the phone greets by the profile's first name, as the computer does;
// the meeting's clause reads whole, its end included; and a meeting titled
// with a pasted link reads as its host, so its password never shows and the
// line keeps a phone's width (CR-16, DESIGN-BUILD-14); an untitled meeting is
// "Untitled event", never "Now: , until" (main, 24 Oct). With SHOTS_DIR set,
// each case is saved for review in both themes.

const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const today = new Date()
const at = (days: number, hour = 17) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hour).toISOString()

const LINK_TITLE = "https://meet.example.com/j/8812345678?pwd=Zm9yZXZlcmFuZGV2ZXJhbmRldmVyYW5kZXZlcg"

/** Home with a mention, a task due today and a meeting on now, called `title` (none: the API leaves it out). */
function answers(title?: string) {
  return {
    // Every page's composer drafts (DraftSyncLoader): none kept.
    "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
    // The guide's check-in step reads #engineering's check-ins: none set up.
    "/checkins": { msg: "ok", data: { checkins: [], can_edit: false } },
    "/user/sidebarNav": { msg: "ok", data: { user_is_admin: false, user_channels: [{ ch_uuid: "6f1c3a52-9d3e-4c9e-a7b1-2f0e5d4c3b2a", ch_name: "engineering" }] } },
    "/project/overview": { msg: "ok", data: {} },
    "/ch/suggested": { msg: "ok", data: null },
    "/activity/unified": {
      msg: "ok",
      data: {
        activities: [
          {
            activity_type: "MENTION",
            time: minutes(-30),
            priority: "high",
            mention: {
              mention_post: {
                post_uuid: "7b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
                post_text: `<span data-id="${SAM.user_uuid}@0x1">@Sam</span> can you check the rollback steps before Thursday?`,
                post_channel: { ch_uuid: "6f1c3a52-9d3e-4c9e-a7b1-2f0e5d4c3b2a", ch_name: "engineering" },
                post_by: { user_uuid: "0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e", user_full_name: "Jonas Weber" },
              },
            },
          },
        ],
      },
    },
    "/user/assignedTaskList": {
      msg: "ok",
      data: { user_tasks: [{ task_uuid: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", task_name: "Write the launch announcement", task_status: "inprogress", task_due_date: at(0) }] },
    },
    "/event/getEvents": {
      msg: "ok",
      data: [
        {
          event_uuid: "e1a2b3c4-0000-4000-8000-000000000001",
          event_title: title,
          event_start_time: minutes(-10),
          event_end_time: minutes(20),
          event_participants: [{ user_uuid: "a11ce000-0000-4000-8000-00000000000a", user_name: "maya", user_full_name: "Maya Chen" }],
        },
      ],
    },
  }
}

/** The line under the greeting, once it names the meeting. */
async function glance(page: Page) {
  await expect(page.locator("[data-greeting]")).toBeVisible({ timeout: 60_000 })
  const line = page.locator("[data-glance]").first()
  await expect(line).toContainText(/Now: .+, until \d/, { timeout: 60_000 })
  return line
}

/** Whether the line shows all it says: no clamp cuts it, and nothing in it runs past its edge. */
const whole = (el: Element) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1

const screens = [
  { name: "a computer", viewport: { width: 1280, height: 900 }, touch: false },
  { name: "a phone", viewport: { width: 390, height: 844 }, touch: true },
]

for (const theme of SHOT_THEMES) {
  for (const s of screens) {
    test.describe(`Home's greeting on ${s.name}, ${theme}`, () => {
      // Reduced motion: on a computer the composition's orbits turn for six minutes, and a review shot waits for a
      // still page. At rest it draws what it ends on; the greeting's line is the case here, not the turning.
      test.use({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } })

      test("greets by the first name and reads the meeting on now whole", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await stubBackend(page, testInfo, answers("Design review"))
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const line = await glance(page)
        await expect(page.locator("[data-greeting]").getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Sam$/)
        await expect(line).toContainText(/Now: Design review, until \d/)
        expect(await line.evaluate(whole), "the line is cut").toBe(true)
        // A phone stacks one clause per line, each from the line's left edge, so "Now:" never ends a line (SF2).
        const starts = await line.evaluate((p) => [...p.querySelectorAll(":scope > [data-fact]")].map((f) => [f.getBoundingClientRect().left - p.getBoundingClientRect().left, f.getBoundingClientRect().top]))
        expect(starts.length).toBe(3)
        if (s.touch) {
          for (const [left] of starts) expect(left).toBeLessThan(1)
          for (let i = 1; i < starts.length; i++) expect(starts[i][1]).toBeGreaterThan(starts[i - 1][1])
        }
        await reviewShot(page, "home-greeting", theme)
      })

      test("says a meeting titled with a link by its host, so no password shows and the line keeps its width", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await stubBackend(page, testInfo, answers(LINK_TITLE))
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const line = await glance(page)
        await expect(line).toContainText(/Now: meet\.example\.com, until \d/)
        await expect(line).not.toContainText("pwd")
        // Today's card says it by its host too, so no password shows anywhere on Home (CR-27).
        await expect(page.locator(s.touch ? "[data-today-strip]" : "[data-today-agenda]")).toContainText("meet.example.com", { timeout: 60_000 })
        await expect(page.locator("body")).not.toContainText("pwd")
        expect(await line.evaluate(whole), "the title runs past the line's edge").toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the page scrolls sideways").toBe(true)
        await reviewShot(page, "home-greeting-link", theme)
      })

      test("names a meeting with no title, in the line and in Today's card", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await stubBackend(page, testInfo, answers())
        await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const line = await glance(page)
        await expect(line).toContainText(/Now: Untitled event, until \d/)
        await expect(page.locator(s.touch ? "[data-today-strip]" : "[data-today-agenda]")).toContainText("Untitled event", { timeout: 60_000 })
        expect(await line.evaluate(whole), "the line is cut").toBe(true)
        await reviewShot(page, "home-greeting-untitled", theme)
      })
    })
  }
}
