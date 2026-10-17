import { expect, test } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"

// QA F-27: on a phone the composer floats over the list's last 150px, and the
// sticky "Jump to latest" counted from above that room, so it hung about 100px
// over the conversation, across a message's author. It sits 12px above the
// composer's card.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }

const message = (i: number) => {
  const from = i % 2 ? SAM : MAYA
  const to = i % 2 ? MAYA : SAM
  return {
    chat_uuid: `0c4a0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    chat_from: from,
    chat_to: to,
    chat_created_at: new Date(Date.UTC(2026, 9, 14, 9, i)).toISOString(),
    chat_body_text: `<p>Message ${i + 1}: the rollback steps, the load test and the launch notes, in order.</p>`,
    chat_attachments: [],
    chat_comment_count: 0,
  }
}

test("on a phone, Jump to latest hangs 12px above the composer", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  await stubBackend(page, testInfo, {
    [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
    [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats: Array.from({ length: 40 }, (_, i) => message(i)), has_more: false } },
    "/dm/": { msg: "ok", data: [] },
    "/user/dm-ai-suggestions": { msg: "ok", data: [] },
  })
  await page.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Message 40:")).toBeVisible({ timeout: 60_000 })
  const card = page.locator("[data-phone-composer]")
  await expect(card).toBeVisible()
  // Up the conversation, a screenful and more, as a reader's own scroll.
  const list = page.getByRole("list", { name: /^Messages with/ })
  await list.hover()
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -900)
  const pill = page.locator("[data-jump-pill]")
  await expect(pill).toBeVisible({ timeout: 15_000 })
  // Measured once it has settled: its row placed by the card's measured top
  // (until then the row's own bottom-3 holds it), and its pill-in, which lifts
  // it 8px as it fades in, over.
  await expect(page.locator("[data-jump-row]")).toHaveAttribute("style", /bottom:/)
  await expect.poll(() => pill.evaluate((el) => el.getAnimations().some((a) => a.playState === "running"))).toBe(false)
  const pillBox = await pill.boundingBox()
  const cardBox = await card.boundingBox()
  const gap = cardBox!.y - (pillBox!.y + pillBox!.height)
  expect(gap).toBeGreaterThanOrEqual(8)
  expect(gap).toBeLessThanOrEqual(16)
})
