import { expect, type Browser, type Page, type TestInfo } from "@playwright/test"

import { SAM, logFailures, stubBackend, tidy, type Answers } from "./stubbedApp"

// #launch from fixtures, signed in as Sam: Jonas's "Staging is green." and
// three members. The chat specs that need a channel page open it here, at a
// computer's width or a phone's, each answering what it tests on top.

const person = (n: string, user_name: string) => ({ user_uuid: `5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e${n}`, user_name, user_full_name: user_name, uid: `0x${n}`, user_profile_object_key: "", user_is_admin: false })
export const MAYA = person("6f", "Maya Chen")
export const JONAS = person("70", "Jonas Weber")
export const ME = { ...SAM, uid: "0x99", user_profile_object_key: "" }
export const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f5"
export const channel = { ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "Ship on Friday", ch_call_active: false,
  unread_post_count: 0, ch_created_at: "2026-10-19T08:00:00Z", ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 3, ch_recording: [] }
export const POST = { post_uuid: "0c4a0000-0000-4000-8000-000000000501", post_text: "<p>Staging is green.</p>", post_by: JONAS, post_created_at: "2026-10-19T09:30:00Z",
  post_attachments: [], post_reactions: [], post_comment_count: 0, post_comments: [] }

export const VIEWS = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const
export type View = (typeof VIEWS)[number]

/**
 * The channel page at a view, signed in as Sam, with `answers(tab)` on top of
 * what the page reads. `prepare(tab)` runs before the page loads and after
 * the stubs, so a route of its own wins over theirs.
 */
export async function openChannel(
  browser: Browser,
  testInfo: TestInfo,
  view: View,
  scheme: string,
  answers: (tab: Page) => Answers = () => ({}),
  prepare?: (tab: Page) => Promise<unknown>,
) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme === "dark" ? "dark" : "light",
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const tab = await context.newPage()
  logFailures(tab)
  await stubBackend(tab, testInfo, {
    "/command/catalog": { msg: "ok", data: { commands: [] } },
    "/message/scheduled": { msg: "ok", data: [] },
    "/user/notificationStatus": { msg: "ok", data: {} },
    "/ai/voice-input": { msg: "ok", data: {} },
    "/ch/getFile": { msg: "ok", data: [] },
    "/ch/markSeen": { msg: "ok" },
    "/activity/seen": { msg: "ok" },
    "/ch/publishChannelTyping": { msg: "ok" },
    "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
    "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS] },
    [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
    [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
    [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [POST], has_more: false } },
    "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
    ...answers(tab),
  })
  // The keyboard tip opens 6 s after the page does, over the list's foot: a
  // test that outlives that under load pressed into it, not the list (the
  // checklist's Open in messageAddOns at CPU 4x, 27 Oct 2026).
  await tab.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await prepare?.(tab)
  await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.getByText("Staging is green.")).toBeVisible({ timeout: 150_000 })
  await tidy(tab)
  return tab
}
