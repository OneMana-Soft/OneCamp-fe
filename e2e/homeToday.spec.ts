import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// Home's Today (calendar B3a): each event in its own colour, as the calendar
// draws it, and an invitation not yet answered asks "Going?" in its row with
// the event card's control; the answer goes to the calendar's API. With
// SHOTS_DIR set, each state is saved for review.

const NOW = new Date(2026, 9, 21, 9, 0)
const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const CRIT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c11"

let response = "needs_action"
const events = () => [
  { event_uuid: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c10", event_title: "Standup", event_start_time: at(9, 30), event_end_time: at(9, 45), event_created_by: ME, event_participants: [MAYA], event_hue: "moss" },
  { event_uuid: CRIT, event_title: "Design critique", event_start_time: at(14), event_end_time: at(15), event_created_by: MAYA, event_participants: [MAYA, ME], event_guests: [{ user_uuid: ME.user_uuid, role: "required", response }], event_hue: "dusk" },
  { event_uuid: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c12", event_title: "Roadmap review", event_start_time: at(16), event_end_time: at(17), event_created_by: ME, event_participants: [MAYA] },
]

async function openHome(page: Page, testInfo: TestInfo) {
  const answers: unknown[] = []
  response = "needs_action"
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    // Read each time, so an answer given shows in the next read, as the server would.
    "/event/getEvents": () => ({ msg: "ok", data: events() }),
    "/ch/suggested": { msg: "ok", data: null },
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/activity/unified": { msg: "ok", data: { has_more: false, activities: [] } },
    "/calendar/events": (url: URL, request: Request) => {
      if (url.pathname.endsWith("/answer")) {
        answers.push(request.postDataJSON())
        // The server keeps it: the next read says so.
        response = (request.postDataJSON() as { answer: string }).answer
      }
      return { msg: "ok", data: {} }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  return answers
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`Home's Today at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("draws each event in its own colour and asks Going? for an invitation", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const answers = await openHome(page, testInfo)
      const card = page.locator("[data-agenda-card]")
      await expect(card.getByText("Design critique")).toBeVisible({ timeout: 60_000 })
      const bars = card.locator("[data-agenda-bar]")
      await expect(bars.nth(0)).toHaveAttribute("style", /--camp-moss/)
      await expect(bars.nth(1)).toHaveAttribute("style", /--camp-dusk/)
      // Roadmap review has no colour of its own: it is in its calendar's, your own, which is sun (the hue ruling).
      await expect(bars.nth(2)).toHaveAttribute("style", /--camp-sun/)
      const going = card.getByRole("radiogroup", { name: "Going?" })
      await expect(going).toHaveCount(1)
      await page.locator("[data-today-agenda]").scrollIntoViewIfNeeded()
      await shot(page, "home-today-invite", theme)
      await going.getByRole("radio", { name: "Yes" }).click()
      await expect.poll(() => answers.length, { timeout: 20_000 }).toBe(1)
      expect(answers[0]).toMatchObject({ answer: "accepted" })
      await expect(going.getByRole("radio", { name: /Yes/ })).toHaveAttribute("aria-checked", "true")
      await shot(page, "home-today-answered", theme)
    })
  })

  test.describe(`Home's Today on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("asks Going? in the strip's card, at 44 px", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openHome(page, testInfo)
      const strip = page.locator("[data-today-strip]")
      await expect(strip.getByText("Design critique")).toBeVisible({ timeout: 60_000 })
      const yes = await strip.getByRole("radio", { name: "Yes" }).boundingBox()
      expect(yes && yes.height >= 43.5, `Yes is ${yes?.height} px tall`).toBe(true)
      // DESIGN-BUILD-22's must-fix (27 Oct): the answer stays in its card, clear of the next one.
      const card = strip.locator("[data-agenda-row]").filter({ hasText: "Design critique" })
      const box = (await card.boundingBox())!
      const answers = (await card.getByRole("radiogroup", { name: "Going?" }).boundingBox())!
      expect(answers.x >= box.x && answers.x + answers.width <= box.x + box.width + 0.5, `the answers ${answers.x}-${answers.x + answers.width}, the card ${box.x}-${box.x + box.width}`).toBe(true)
      for (const c of await strip.locator("[data-agenda-row]").filter({ hasNotText: "Design critique" }).all()) {
        const other = (await c.boundingBox())!
        expect(other.x >= box.x + box.width || other.x + other.width <= box.x, "a card under the invitation's").toBe(true)
      }
      await strip.getByText("Design critique").scrollIntoViewIfNeeded()
      await shot(page, "home-today-strip", theme)
    })
  })
}
