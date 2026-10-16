import { expect, test } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// Sam's inbox (stubbedApp signs in as Sam Rivera) shows a mention in a doc's body (docs programme A6): a notice,
// activity type NOTICE, which the inbox asks for with notices=1. Its row names
// who mentioned Sam and the page, and opens the page.

const DOC = "7d1e5c2a-9b3f-4a6e-8c1d-2f4b6a8e0c3d"
const AKASH = { user_uuid: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b", user_name: "Akash", user_full_name: "Akash" }

test.use({ viewport: { width: 1280, height: 900 } })

test("Sam's inbox shows a mention in a doc", async ({ page }, testInfo) => {
  const now = new Date().toISOString()
  const asked: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("/activity/unified")) asked.push(req.url())
  })
  await stubBackend(page, testInfo, {
    "/activity/unified": {
      msg: "ok",
      data: {
        has_more: false,
        activities: [
          {
            activity_type: "NOTICE",
            time: now,
            priority: "normal",
            actor_kind: "person",
            notice: {
              id: "0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a0b",
              kind: "doc.mentioned",
              resource_kind: "doc",
              resource_uuid: DOC,
              title: "Launch notes",
              can_open: true,
              reason: "mention",
              actor: AKASH,
              created_at: now,
            },
          },
        ],
      },
    },
  })
  await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })

  const row = page.getByRole("link", { name: /Akash mentioned you in Launch notes/ })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await expect(row).toHaveAttribute("href", `/app/doc/${DOC}`)
  expect(asked.some((url) => url.includes("notices=1"))).toBe(true)
})

// A request for access and its answers (A5×A6): Sam asked Akash for access.
// An approval names who approved it and the page, and opens it; a decline
// names neither who declined nor a page Sam can't open, and opens nothing.
test("Sam's inbox shows a request for access, its approval and a decline", async ({ page }, testInfo) => {
  const now = new Date()
  const at = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
  const OTHER = "9c2e7b14-5a3d-4f6e-8b1c-0d2e4f6a8b0c"
  const notice = (id: string, s: number, extra: Record<string, unknown>) => ({
    activity_type: "NOTICE",
    time: at(s),
    priority: "normal",
    actor_kind: "person",
    notice: { id, resource_kind: "doc", reason: "subject", created_at: at(s), ...extra },
  })
  await stubBackend(page, testInfo, {
    "/activity/unified": {
      msg: "ok",
      data: {
        has_more: false,
        activities: [
          notice("1c4f7a20-3b5d-4e6f-8a9b-0c1d2e3f4a5b", 10, {
            kind: "doc.access_answered",
            resource_uuid: DOC,
            title: "Launch notes",
            can_open: true,
            actor: AKASH,
            data: { request: "r2", status: "approved", level: "comment" },
          }),
          notice("2d5a8b31-4c6e-4f7a-9b0c-1d2e3f4a5b6c", 20, {
            kind: "doc.access_answered",
            resource_uuid: OTHER,
            can_open: false,
            data: { request: "r1", status: "declined", level: "edit" },
          }),
          notice("3e6b9c42-5d7f-4a8b-8c1d-2e3f4a5b6c7d", 30, {
            kind: "doc.access_requested",
            resource_uuid: DOC,
            title: "Launch notes",
            can_open: true,
            actor: AKASH,
            data: { request: "r3", level: "edit" },
          }),
        ],
      },
    },
  })
  await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })

  const approved = page.getByRole("link", { name: /Akash approved your request for Launch notes/ })
  await expect(approved).toBeVisible({ timeout: 30_000 })
  await expect(approved).toHaveAttribute("href", `/app/doc/${DOC}`)
  await expect(page.getByRole("link", { name: /Akash asked to edit Launch notes/ })).toHaveAttribute("href", `/app/doc/${DOC}`)

  const declined = page.locator("[data-feed-row]").filter({ hasText: "declined your request to edit" })
  await expect(declined).toHaveCount(1)
  await expect(declined).toContainText("a page you can't open")
  await expect(declined).not.toContainText("Akash")
  await expect(declined.getByRole("link")).toHaveCount(0)
})
