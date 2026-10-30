import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

// The attachment lightbox and the recording player (DESIGN-BUILD-9 on the base
// dialog's phone sheet, 23 Oct 2026). On a phone the lightbox stands on an
// opaque ground: at .92 the channel read through it at 2x. It offers one
// Download, the header's. The player's name keeps to one line with its type
// in view, its facts are joined by a middle dot, and its transcript draws an
// edge only where it stands beside the video. Each viewer's own media read
// waits unanswered, so what is checked is the frame.

const holdMedia = (page: Page) => page.route(/\/(getFile|getRecordingURL)\//, () => {})
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const ENG = "0c4a0000-0000-4000-8000-0000000000e1"
const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "Maya Chen", user_full_name: "Maya Chen" }
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

async function openLightbox(page: Page, testInfo: TestInfo, phone: boolean) {
  const photo = {
    attachment_uuid: "a77a0000-0000-4000-8000-000000000001", attachment_file_name: "whiteboard.png", attachment_obj_key: "k/whiteboard.png",
    attachment_type: "image", attachment_size: 48_213, attachment_created_at: ago(30), attachment_width: 1200, attachment_height: 800,
  }
  const channel = {
    ch_uuid: ENG, ch_name: "engineering", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false,
    unread_post_count: 0, ch_created_at: ago(600), ch_is_member: true, ch_posts: [], ch_created_by: MAYA, ch_member_count: 5, ch_recording: [],
  }
  const post = {
    post_uuid: "0c4a0000-0000-4000-8000-000000000101", post_text: "<p>The whiteboard from this morning.</p>", post_by: MAYA,
    post_created_at: ago(30), post_attachments: [photo], post_reactions: [], post_comment_count: 0, post_comments: [],
  }
  await stubBackend(page, testInfo, {
    [`/ch/channelBasicInfo/${ENG}`]: { msg: "ok", channel_info: channel },
    [`/po/latestPosts/${ENG}`]: { msg: "ok", data: { posts: [post], has_more: false } },
  })
  await holdMedia(page)
  // The keys tip comes up in the left corner on a computer, over the message's picture.
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/channel/${ENG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const open = page.getByRole("button", { name: "Open whiteboard.png" }).first()
  if (phone) await open.tap({ timeout: 60_000 })
  else await open.click({ timeout: 60_000 })
  const box = page.locator("[data-lightbox]")
  await expect(box).toBeVisible({ timeout: 60_000 })
  return box
}

for (const theme of ["light", "dark"] as const) {
  for (const phone of [true, false]) {
    test.describe(`the lightbox ${phone ? "on a phone" : "at 1280"}, ${theme}`, () => {
      test.use(phone ? { ...PHONE, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("stands on its ground", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const box = await openLightbox(page, testInfo, phone)
        const ground = await box.evaluate((el) => getComputedStyle(el).backgroundColor)
        expect(ground, phone ? "opaque on a phone" : "92% around a centred image").toBe(phone ? "rgb(8, 9, 10)" : "rgba(8, 9, 10, 0.92)")
        await reviewShot(page, "viewer-lightbox", theme)
      })

      test("offers one Download", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await openLightbox(page, testInfo, phone)
        await expect(page.getByRole("button", { name: "Download", exact: true })).toHaveCount(1)
      })
    })
  }

  test.describe(`the recording player on a phone, ${theme}`, () => {
    test.use({ ...PHONE, colorScheme: theme })

    test("keeps its name to one line with its type, and its transcript has no edge beside nothing", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const recording = {
        recording_egress_id: "EG_view0001", recording_stared_at: ago(90), recording_ended_at: ago(60), recording_duration: 1800,
        recording_obj_key: "rec/EG_view0001.mp4", recording_transcript: [], recording_size: 52_428_800, recording_started_by: MAYA,
      }
      await stubBackend(page, testInfo, {
        "/user/recordingList": { msg: "ok", data: { recordings: [recording], has_more: false } },
        "/getRecordingTranscript/": { msg: "ok", data: { recording_transcript: [], transcript_count: 0 }, pageCount: 0 },
      })
      await holdMedia(page)
      await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.getByRole("button", { name: "Play" }).first().tap({ timeout: 60_000 })
      const player = page.locator('[role="dialog"][data-full-screen]')
      await expect(player).toBeVisible({ timeout: 60_000 })
      const title = player.getByRole("heading").first()
      const lines = await title.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
      expect(lines, "the name keeps to one line").toBe(1)
      const name = (await title.textContent()) ?? ""
      expect(name, "the name ends with its type").toMatch(/\.mp4$/)
      const [titleBox, tailBox] = await Promise.all([title.boundingBox(), title.locator("[data-middle-name] > span").last().boundingBox()])
      expect(tailBox && titleBox && tailBox.x + tailBox.width <= titleBox.x + titleBox.width + 1, "its type stays in view").toBe(true)
      await expect(player.getByText(/^50 MB · /)).toBeVisible()
      const edge = await player.locator("[data-transcript]").evaluate((el) => getComputedStyle(el).borderLeftWidth)
      expect(edge, "stacked under the video, the transcript draws no left edge").toBe("0px")
      await reviewShot(page, "viewer-player", theme)
    })
  })
}
