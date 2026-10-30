import { expect, test } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"

// Chat's file cards with long names, in a real browser with no backend: the
// name gives way in its middle and keeps its end and type in view
// (MiddleName), no card widens the conversation on a phone, and sizes are
// written the one way ("279 bytes", "47.1 KB"). With SHOTS=<dir> the
// conversation is also saved at 1280 and 390, light and dark.

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const at = (m: number) => new Date(Date.UTC(2026, 9, 22, 9, m)).toISOString()
const LONG_PDF = "q4-launch-checkout-flow-review-notes-from-the-design-crit-final.pdf"
const LONG_ZIP = "onecamp-design-review-assets-for-the-checkout-flow-2026-10-22.zip"
const NOTES = "0c4a0000-0000-4000-8000-000000000011"
const file =(n: number, name: string, size: number, raw: string) => ({
  attachment_uuid: `0c4b0000-0000-4000-8000-00000000000${n}`, attachment_file_name: name, attachment_obj_key: `chat/${name}`,
  attachment_type: "document", attachment_raw_type: raw, attachment_size: size, attachment_created_at: at(2),
})

const chats = [
  {
    chat_uuid: NOTES, chat_from: MAYA, chat_to: SAM, chat_created_at: at(2), chat_comment_count: 0,
    chat_body_text: "<p>The crit's notes, the assets and my list.</p>", chat_reactions: [],
    chat_attachments: [
      file(1, LONG_PDF, 48_210, "application/pdf"),
      file(2, LONG_ZIP, 2_516_582, "application/zip"),
      file(3, "notes.txt", 279, "text/plain"),
    ],
  },
]

// The composer's and header's own reads, answered so no stray toast sits in the shots.
const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a long file name is cut in its middle, keeps its type, and never widens the conversation`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const page = await context.newPage()
      await stubBackend(page, testInfo, {
        ...QUIET,
        "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
        [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
        [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats, has_more: false } },
        "/dm/getFile": { msg: "ok", data: {} },
        "/dm/": { msg: "ok", data: [] },
        "/user/dm-ai-suggestions": { msg: "ok", data: [] },
      })

      await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      // The message itself: on a computer the list's row for this DM repeats it.
      await expect(page.locator(`#msg-${NOTES}`).getByText("The crit's notes")).toBeVisible({ timeout: 60_000 })

      for (const name of [LONG_PDF, LONG_ZIP]) {
        const card = page.locator(`[data-file-card][title="${name}"]`)
        await expect(card).toBeVisible()
        const cut = await card.locator("[data-middle-name]").evaluate((el) => {
          const [head, tail] = Array.from(el.children) as HTMLElement[]
          const box = el.getBoundingClientRect(), end = tail.getBoundingClientRect()
          return {
            headCut: head.scrollWidth > head.clientWidth,
            tail: tail.textContent ?? "",
            tailWhole: tail.scrollWidth <= tail.clientWidth && end.right <= box.right + 0.5,
          }
        })
        expect(cut.headCut, `${name}'s start gives way`).toBe(true)
        expect(cut.tail, `${name}'s end shows its type`).toMatch(/\.(pdf|zip)$/)
        expect(cut.tailWhole, `${name}'s end is never cut`).toBe(true)
        const box = await card.boundingBox()
        expect(box && box.x + box.width <= view.viewport.width, `${name}'s card stays on the screen`).toBe(true)
      }
      // One way to write a size, beside each other.
      await expect(page.locator('[data-file-card][title="notes.txt"]')).toContainText("279 bytes")
      await expect(page.locator(`[data-file-card][title="${LONG_PDF}"]`)).toContainText("47.1 KB")
      await expect(page.locator(`[data-file-card][title="${LONG_ZIP}"]`)).toContainText("2.4 MB")
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/chat-file-cards-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}
