import { expect, test } from "@playwright/test"

import { SAM, stubBackend, withStatus } from "./stubbedApp"

// CAL-BUG-7: on a phone, and from a link, an event outside today's month read
// "This event isn't available": the event page looked for it in the list of
// today's month only. It asks for the event by its id now.

const EVENT = "6f0c1b2a-3d4e-4f50-8a6b-7c8d9e0f1a2b"

function answers(event: unknown = undefined) {
  const start = new Date()
  start.setMonth(start.getMonth() + 2, 14)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    // Today's month holds nothing: where the old page looked.
    "/event/getEvents": { msg: "ok", data: [] },
    [`/event/getEvent/${EVENT}`]:
      event ?? {
        msg: "Got event",
        data: { event_uuid: EVENT, event_title: "Quarterly planning", event_start_time: start.toISOString(), event_end_time: end.toISOString(), event_created_by: SAM, event_participants: [] },
      },
  }
}

test("a phone opens an event two months out", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await stubBackend(page, testInfo, answers())
  await page.goto(`/app/calendar/event/${EVENT}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "Quarterly planning" })).toBeVisible({ timeout: 30_000 })
  // Named on a phone (PTC-53): Edit, and the rest in a labelled menu.
  await expect(page.getByRole("button", { name: "Edit event" })).toBeVisible()
  await page.getByRole("button", { name: "More actions" }).click()
  await expect(page.getByRole("menuitem", { name: "Delete event" })).toBeVisible()
  await expect(page.getByText("This event isn't available")).toHaveCount(0)
})

test("a link to an event opens it beside the calendar on a computer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await stubBackend(page, testInfo, answers())
  await page.goto(`/app/calendar/event/${EVENT}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.waitForURL(/\/app\/calendar$/, { timeout: 30_000 })
  await expect(page.getByRole("heading", { name: "Quarterly planning" })).toBeVisible({ timeout: 30_000 })
})

test("says an event isn't there when the server says so", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await stubBackend(page, testInfo, answers(withStatus(404, { msg: "This event isn't available." })))
  await page.goto(`/app/calendar/event/${EVENT}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByRole("heading", { name: "This event isn't available" })).toBeVisible({ timeout: 30_000 })
})
