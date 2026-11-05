import { expect, test } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"

// slack-06: a huddle's post is the call's card, in a real browser with no
// backend. An ended call says how long it ran and who came; the call that is
// on shows who is in it now (the conversation's call read), how long it has
// run, and Join; when the server says the call changed and it is over, the
// card says so. With SHOTS=<dir> each view is saved at 1280 and 390, light
// and dark.

const person = (n: string, user_name: string) => ({ user_uuid: `5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e${n}`, user_name, user_full_name: user_name, uid: `0x${n}`, user_profile_object_key: "" })
const MAYA = person("6f", "Maya Chen")
const JONAS = person("70", "Jonas Weber")
const ME = { ...SAM, uid: "0x99", user_name: "Sam Rivera" }
const LAUNCH = "0c4a0000-0000-4000-8000-0000000000f3"
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 19, h, m)).toISOString()
const channel = { ch_uuid: LAUNCH, ch_name: "launch", ch_icon: "", ch_private: false, ch_is_user_fav: false, ch_about: "", ch_call_active: true,
  unread_post_count: 0, ch_created_at: at(8, 0), ch_is_member: true, ch_is_admin: 1, ch_posts: [], ch_created_by: MAYA, ch_member_count: 8, ch_recording: [] }
const base = { post_attachments: [], post_reactions: [], post_comment_count: 0, post_comments: [] }
const message = (id: string, by: object, html: string, h: number, m: number) => ({ ...base, post_uuid: id, post_text: html, post_by: by, post_created_at: at(h, m) })
const huddle = (id: string, by: { user_name: string }, h: number, m: number, facts: object) => ({
  ...message(id, by, `<p>${by.user_name} started a call</p>`, h, m), post_kind: "huddle", post_system: JSON.stringify(facts),
})
const ENDED = "0c4a0000-0000-4000-8000-000000000401"
const LIVE = "0c4a0000-0000-4000-8000-000000000402"

// A card's people line as drawn: the words that show, and whether the count is
// whole (inside the line, not cut). A name may be cut; the count never is.
const drawnPeople = (card: import("@playwright/test").Locator) =>
  card.locator("[data-people-line]").evaluate((line: HTMLElement) => {
    const drawn = line.querySelector("[aria-hidden]") as HTMLElement | null
    const [names, ...counts] = Array.from(drawn?.children ?? []) as HTMLElement[]
    const count = counts.find((c) => getComputedStyle(c).display !== "none")
    const box = line.getBoundingClientRect(), end = count?.getBoundingClientRect()
    return {
      // The names and the count that shows, as one line reads them.
      text: drawn ? `${names?.textContent ?? ""}${count?.textContent ?? ""}` : line.textContent,
      heard: line.querySelector(".sr-only")?.textContent ?? line.textContent,
      countWhole: !count || (count.scrollWidth <= count.clientWidth + 0.5 && !!end && end.right <= box.right + 0.5),
    }
  })

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a huddle's post shows the call, on and over`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      tab.on("response", (r) => {
        if (r.status() >= 400 && new URL(r.url()).pathname !== "/") console.log(`PROBE ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
      })
      tab.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}`))
      // The call on now started four minutes ago (by this machine's clock: the card counts from it).
      const started = new Date(Date.now() - 4 * 60_000).toISOString()
      const posts = [
        message("0c4a0000-0000-4000-8000-000000000400", MAYA, "<p>Standup in five.</p>", 8, 55),
        huddle(ENDED, MAYA, 9, 0, { session: "s-ended", started: at(9, 0), ended: at(9, 12), seconds: 720, came: [{ uuid: MAYA.user_uuid, name: "Maya Chen" }, { uuid: JONAS.user_uuid, name: "Jonas Weber" }], people: 3 }),
        message("0c4a0000-0000-4000-8000-000000000403", JONAS, "<p>Notes are in the doc.</p>", 9, 20),
        huddle(LIVE, JONAS, 10, 0, { session: "s-live", started }),
      ]
      let read: object = {
        live: true,
        session: { id: "s-live", people: [
          { identity: "0x70", user_uuid: JONAS.user_uuid, name: "Jonas Weber", role: "host", in_call: true },
          { identity: "0x6f", user_uuid: MAYA.user_uuid, name: "Maya Chen", role: "participant", in_call: true },
          { identity: "guest-1", name: "Guest: Kai", role: "guest", guest: true, in_call: true },
        ] },
        you: { role: "participant", can: [] },
      }
      let reads = 0
      const wrong: string[] = []
      await stubBackend(tab, testInfo, {
        "/command/catalog": { msg: "ok", data: { commands: [] } },
        "/message/scheduled": { msg: "ok", data: [] },
        "/user/notificationStatus": { msg: "ok", data: {} },
        "/ai/voice-input": { msg: "ok", data: {} },
        "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
        "/ch/getFile": { msg: "ok", data: [] },
        "/ch/markSeen": { msg: "ok" },
        "/activity/seen": { msg: "ok" },
        "/user/botKinds": { msg: "ok", data: {} },
        "/ch/publishChannelTyping": { msg: "ok" },
        "/user/sidebarNav": { msg: "ok", data: { ...SAM, user_channels: [channel] } },
        "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS] },
        [`/ch/${LAUNCH}/mention-agents`]: { users: [] },
        [`/ch/channelBasicInfo/${LAUNCH}`]: { msg: "ok", channel_info: channel },
        [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [...posts].reverse(), has_more: false } },
        "/conversations/channel/": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
        "/calls/current": (url: URL) => {
          // Only the conversation's own call is read.
          if (url.searchParams.get("kind") !== "channel" || url.searchParams.get("id") !== LAUNCH) wrong.push(url.search)
          reads++
          return { msg: "ok", data: read }
        },
      })
      await tab.goto(`/app/channel/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("Notes are in the doc.")).toBeVisible({ timeout: 150_000 })
      await tidy(tab)

      // The ended call: how long it ran and who came, with their faces; no Join.
      const ended = tab.locator(`[data-call-card="ended"]`)
      await expect(ended).toHaveCount(1, { timeout: 30_000 })
      await expect(ended).toContainText("Huddle ended")
      await expect(ended).toContainText("12 min")
      await expect(ended).toContainText("Maya, Jonas and 1 other")
      await expect(ended.locator("[data-participant]")).toHaveCount(2)
      await expect(ended.getByRole("link", { name: "Join the huddle" })).toHaveCount(0)

      // The call on now: who is in it (members' faces, the guest counted), how long, and Join.
      const live = tab.locator(`[data-call-card="live"]`)
      await expect(live).toContainText("Huddle on now", { timeout: 30_000 })
      await expect(live).toContainText("Jonas, Maya and 1 other")
      await expect(live.locator("[data-participant]")).toHaveCount(2)
      await expect(live.locator("[data-call-length]")).toHaveText(/· 4:0\d/)
      const join = live.getByRole("link", { name: "Join the huddle" })
      await expect(join).toHaveAttribute("href", `/app/meet/ch/${LAUNCH}`)
      // Who is in it, beside Join: on a phone the count reads "+1" and stays whole
      // (it was "Jonas, Maya and 1 o…", DESIGN-BUILD-113); it is heard in full.
      for (const card of [ended, live]) expect((await drawnPeople(card)).countWhole, "the count is never cut").toBe(true)
      const people = await drawnPeople(live)
      expect(people.text).toBe(view.phone ? "Jonas, Maya +1" : "Jonas, Maya and 1 other")
      expect(people.heard).toBe("Jonas, Maya and 1 other")
      // The cards stand in for the posts' words.
      await expect(tab.getByText("started a call")).toHaveCount(0)
      await tab.waitForTimeout(400)
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/huddle-${view.name}-${scheme}.png` })
      if (!view.phone) {
        // Join is reached by keyboard and shows its ring.
        await join.focus()
        await tab.keyboard.press("Shift+Tab")
        await tab.keyboard.press("Tab")
        await expect(join).toBeFocused()
        expect(await join.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
        const box = await live.boundingBox()
        if (process.env.SHOTS && box) {
          await tab.screenshot({ path: `${process.env.SHOTS}/huddle-join-focus-${view.name}-${scheme}.png`, clip: { x: box.x - 24, y: box.y - 24, width: box.width + 48, height: box.height + 48 } })
        }
        await join.blur()
      }

      // The server says the conversation's call changed, and it is over: the card says so at once.
      read = { live: false, session: null, you: { role: "participant", can: [] } }
      const before = reads
      await tab.evaluate((id) => window.dispatchEvent(new CustomEvent("onecamp:call-state", { detail: { resource_kind: "channel", resource_id: id } })), LAUNCH)
      await expect(tab.locator(`[data-call-card="ended"]`)).toHaveCount(2, { timeout: 15_000 })
      await expect(tab.locator(`[data-call-card="live"]`)).toHaveCount(0)
      expect(reads).toBeGreaterThan(before)
      const after = reads
      // Another conversation's call changing reads nothing.
      await tab.evaluate(() => window.dispatchEvent(new CustomEvent("onecamp:call-state", { detail: { resource_kind: "channel", resource_id: "another" } })))
      await tab.waitForTimeout(500)
      expect(reads).toBe(after)
      expect(wrong).toEqual([])
      await context.close()
    })
  }
}

// A DM's call nobody answered (slack-06): the card says "Missed call" with the
// berry mark, no faces, no Join; the post's words stand down. One theme each.
const MISSED = "0c4a0000-0000-4000-8000-000000000405"
for (const [view, scheme] of [[views[0], "light"], [views[1], "dark"]] as const) {
  test(`at ${view.name}, ${scheme}: a DM's call nobody answered is a missed call`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000)
    const context = await browser.newContext({
      baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
      ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
    })
    const tab = await context.newPage()
    tab.on("pageerror", (e) => console.log(`PAGEERROR ${e.message}`))
    const chat = (id: string, from: object, text: string, m: number, extra: object = {}) => ({
      chat_uuid: id, chat_from: from, chat_to: ME, chat_created_at: at(9, m), chat_comment_count: 0,
      chat_body_text: text, chat_reactions: [], chat_attachments: [], ...extra,
    })
    const chats = [
      chat("0c4a0000-0000-4000-8000-000000000404", MAYA, "<p>Got a minute?</p>", 0),
      chat(MISSED, MAYA, "<p>Maya Chen started a call</p>", 1, {
        chat_kind: "huddle", chat_system: JSON.stringify({ session: "s-missed", started: at(9, 1), ended: at(9, 2), seconds: 0, came: [], people: 0, missed: true }),
      }),
      chat("0c4a0000-0000-4000-8000-000000000406", MAYA, "<p>No worries, later.</p>", 3),
    ]
    await stubBackend(tab, testInfo, {
      "/command/catalog": { msg: "ok", data: { commands: [] } },
      "/message/scheduled": { msg: "ok", data: [] },
      "/user/notificationStatus": { msg: "ok", data: {} },
      "/ai/voice-input": { msg: "ok", data: {} },
      "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
      "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
      "/user/allUsers": { msg: "ok", users: [ME, MAYA, JONAS] },
      [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
      [`/dm/latestChat/${MAYA.user_uuid}`]: { msg: "ok", data: { chats, has_more: false } },
      "/dm/getFile": { msg: "ok", data: {} },
      "/dm/": { msg: "ok", data: [] },
      "/user/dm-ai-suggestions": { msg: "ok", data: [] },
      "/user/botKinds": { msg: "ok", data: {} },
    })
    await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(tab.locator("#msg-0c4a0000-0000-4000-8000-000000000406").getByText("No worries, later.")).toBeVisible({ timeout: 150_000 })
    await tidy(tab)
    const missed = tab.locator(`#msg-${MISSED} [data-call-card="missed"]`)
    await expect(missed).toHaveCount(1, { timeout: 30_000 })
    await expect(missed).toContainText("Missed call")
    await expect(missed.locator("[data-participant]")).toHaveCount(0)
    await expect(missed.locator("[data-people-line]")).toHaveCount(0)
    await expect(missed.getByRole("link", { name: "Join the huddle" })).toHaveCount(0)
    await expect(tab.locator(`#msg-${MISSED}`).getByText("started a call")).toHaveCount(0)
    expect(await tab.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await tab.waitForTimeout(400)
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/huddle-missed-dm-${view.name}-${scheme}.png` })
    await context.close()
  })
}
