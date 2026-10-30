import { expect, test, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// DG4's cap, in a real browser on a production build: the forward picker
// counts the places chosen to the server's limit of 100, and at 100 stops
// taking more and says why. A phone forwards on its own page
// (/app/forward); a computer from a message's More actions, in a dialog
// (the page sends a computer home).

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }

const ok = (data: unknown) => ({ msg: "ok", data })
const person = (i: number) => ({ user_uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, user_name: `person${i}`, user_dgraph_uid: `0x${(i + 10).toString(16)}` })
const PEOPLE = Array.from({ length: 100 }, (_, i) => person(i + 1))
const CHAT = "00000000-0000-4000-9000-000000000001"
const CH = "c4a70000-0000-4000-8000-000000000003"
const MAYA = { user_uuid: "5a7a1c11-0000-4000-8000-000000000101", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.test" }
const channel = { ch_uuid: CH, ch_name: "engineering", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: false, unread_post_count: 0, ch_created_at: "2026-09-01T09:00:00Z", ch_is_member: true, ch_posts: [], ch_created_by: SAM, ch_member_count: 2, ch_recording: [], notification_type: "all" }
const post = { post_uuid: "c4a70000-0000-4000-8000-100000000010", post_text: "<p>The launch notes are in.</p>", post_by: MAYA, post_created_at: "2026-10-17T09:00:00Z", post_comment_count: 0, post_comments: [], post_reactions: [], post_attachments: [], post_channel: { ch_uuid: CH, ch_name: "engineering" } }

/** Opens the picker as a person forwards on this device; a search answers the people whose handle is what was typed. */
async function openPicker(page: Page, phone: boolean): Promise<Locator> {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, test.info(), {
    "/user/searchUserAndChannelList": (_url: URL, request: { postDataJSON: () => { search_text: string } }) => {
      const text = request.postDataJSON().search_text
      return ok(PEOPLE.filter((p) => p.user_name === text))
    },
    "/dm/getChatOnlyText": ok({ chat_uuid: CHAT, chat_body_text: "<p>The launch notes are in.</p>", chat_from: { ...SAM }, chat_created_at: "2026-10-25T09:00:00Z" }),
    "/po/getOnlyPostText": ok(post),
    "/user/sidebarNav": ok({ ...SAM, user_channels: [channel], user_dms: [], user_projects: [] }),
    [`/ch/channelBasicInfo/${CH}`]: { msg: "ok", channel_info: channel },
    "/ch/userActiveChannelsWithLatestPost": { msg: "ok", channels_list: [channel] },
    [`/po/latestPosts/${CH}`]: ok({ posts: [post], has_more: false }),
    "/agent-card/channel": ok([]),
    "/command/catalog": ok({ commands: [] }),
    "/message/scheduled": ok([]),
    "/ch/markSeen": ok({}),
    "/later": ok({ items: [] }),
  })
  if (phone) {
    await page.goto(`/app/forward/chat/${CHAT}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
  } else {
    await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 180_000 })
    await expect(page.getByText("The launch notes are in.").first()).toBeVisible({ timeout: 60_000 })
    await page.locator("[data-message-row]").first().hover({ position: { x: 300, y: 10 } })
    await page.locator("[data-message-toolbar]").getByRole("button", { name: "More actions" }).click()
    await page.getByRole("menuitem", { name: "Forward" }).click()
    await expect(page.getByRole("dialog", { name: "Forward this message" })).toBeVisible()
  }
  // The picker's text field (its placeholder goes once a place is chosen).
  const field = page.locator('[data-forward-picker] input[type="text"]')
  await expect(field).toBeVisible({ timeout: 60_000 })
  return field
}

/** Chooses person i: types their handle and picks them from what the search found. */
async function choose(page: Page, field: Locator, i: number, phone: boolean) {
  await field.fill(`person${i}`)
  const found = page.getByText(`person${i}`, { exact: true }).last()
  if (phone) await found.tap()
  else await found.click()
}

for (const [name, options] of [
  ["a 390px phone, by touch", PHONE],
  ["a 1280px computer", COMPUTER],
] as const) {
  const phone = !!options.hasTouch
  for (const theme of SHOT_THEMES) {
    test(`the forward picker counts the places chosen to 100, on ${name} (${theme})`, async ({ browser }) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({ ...options, colorScheme: theme })
      const page = await context.newPage()
      const field = await openPicker(page, phone)
      await choose(page, field, 1, phone)
      await expect(page.locator("[data-forward-count]")).toHaveText("1 of 100 places")
      await reviewShot(page, "forward-count", theme)
      await context.close()
    })

    test(`the forward picker stops at 100 places and says why, on ${name} (${theme})`, async ({ browser }) => {
      test.setTimeout(360_000)
      const context = await browser.newContext({ ...options, colorScheme: theme })
      const page = await context.newPage()
      const field = await openPicker(page, phone)
      for (let i = 1; i <= 100; i++) await choose(page, field, i, phone)
      await expect(page.locator("[data-forward-count]")).toHaveText("100 of 100: that's the most one forward can go to. Remove one to add another.")
      await expect(field).toBeDisabled()
      await reviewShot(page, "forward-stop", theme)
      await context.close()
    })
  }
}
