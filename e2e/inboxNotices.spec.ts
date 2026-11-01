import { expect, test } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

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

// Every rule notice read "Someone A rule asks you to look at …" beside an "S"
// face, as if a person had sent it (DESIGN-BUILD-48, 30 Oct). A rule's notice
// is the rule's own sentence: no name before it and no face beside it. Its
// lead is the rule's own mark, at a face's size in the face's room, with no
// badge at a corner (DESIGN-BUILD-49), while a person's row beside it keeps
// its face and its corner badge. At both widths and in both themes.
for (const theme of SHOT_THEMES) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })
      test("Sam's inbox shows a rule's notices as the rule's own sentence, led by the rule's mark", async ({ page }, testInfo) => {
        const now = new Date()
        const at = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
        const notice = (id: string, s: number, extra: Record<string, unknown>) => ({
          activity_type: "NOTICE",
          time: at(s),
          priority: "normal",
          notice: { id, reason: "subject", created_at: at(s), can_open: true, ...extra },
        })
        await stubBackend(page, testInfo, {
          // The inbox's own reads and its read mark, answered as the other inbox specs answer them,
          // so no stub toast lands in the review shot.
          "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
          "/activity/seen": { msg: "ok" },
          "/activity/unified": {
            msg: "ok",
            data: {
              has_more: false,
              activities: [
                notice("4f7c0d53-6e8a-4b9c-9d2e-3f4a5b6c7d8e", 10, { kind: "work.rule", resource_kind: "task", resource_uuid: "8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", title: "Q4-2 Review the pricing page" }),
                notice("5a8d1e64-7f9b-4cad-8e3f-4a5b6c7d8e9f", 20, { kind: "work.rule.paused", resource_kind: "rule", resource_uuid: "9b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", title: "Triage", data: { project_id: "0c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f" } }),
                {
                  ...notice("6b9e2f75-8a0c-4dbe-9f4a-5b6c7d8e9fa0", 30, { kind: "doc.mentioned", resource_kind: "doc", resource_uuid: DOC, title: "Launch notes", reason: "mention", actor: AKASH }),
                  actor_kind: "person",
                },
              ],
            },
          },
        })
        await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })
        // A person's row is as it was: their face, and the kind's badge at its corner.
        const person = page.locator("[data-feed-row]").filter({ hasText: "Akash mentioned you in" })
        await expect(person).toHaveCount(1, { timeout: 30_000 })
        await expect(person.locator("[data-hue]")).toHaveCount(1)
        await expect(person.locator("[data-kind-badge]")).toHaveCount(1)
        await expect(person.locator("[data-kind-badge]")).toHaveAttribute("data-kind-badge", "mention")
        expect(await person.locator("[data-kind-badge]").getAttribute("data-lead"), "a person's badge sits at the face's corner").toBeNull()
        const face = await person.locator("[data-hue]").boundingBox()
        for (const words of ["A rule asks you to look at", "Your rule stopped itself:"]) {
          const row = page.locator("[data-feed-row]").filter({ hasText: words })
          await expect(row).toHaveCount(1, { timeout: 30_000 })
          await expect(row).not.toContainText("Someone")
          await expect(row.locator("[data-hue]"), `${words}: no person's face`).toHaveCount(0)
          // One mark, the rule's own, leads the row: no second badge at a corner.
          const mark = row.locator("[data-kind-badge]")
          await expect(mark, `${words}: one mark`).toHaveCount(1)
          await expect(mark).toHaveAttribute("data-kind-badge", "rule")
          await expect(mark).toHaveAttribute("data-lead", /^(24|32)$/)
          // At the face's size, centred in the face's room.
          const box = await mark.boundingBox()
          const room = await row.locator(".hub-row-lead").boundingBox()
          expect(box && face && room, `${words}: the mark, the face and the room are drawn`).toBeTruthy()
          expect(Math.abs(box!.width - face!.width), `${words}: a face's width`).toBeLessThan(0.5)
          expect(Math.abs(box!.height - face!.height), `${words}: a face's height`).toBeLessThan(0.5)
          expect(Math.abs(box!.x + box!.width / 2 - (room!.x + room!.width / 2)), `${words}: centred across`).toBeLessThan(0.5)
          expect(Math.abs(box!.y + box!.height / 2 - (room!.y + room!.height / 2)), `${words}: centred down`).toBeLessThan(0.5)
        }
        await expect(page.getByRole("link", { name: /^A rule asks you to look at Q4-2 Review the pricing page/ })).toBeVisible()
        await reviewShot(page, "inbox-rule-notices", theme)
      })
    })
  }
}
