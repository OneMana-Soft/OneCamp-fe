import { expect, test, type Request } from "@playwright/test"
import { SAM, stubBackend } from "./stubbedApp"

// Chat P5 in a real browser with no backend: a draft kept on the server comes
// back in its composer (here a DM's, started on another device), and a link to
// a message opens the conversation at it, lit up. With SHOTS=<dir> each is
// saved at 1280 and 390, light and dark (the link at 1280: a phone opens a
// link's message on its own page, as before).

const MAYA = { user_uuid: "5b1d7c2e-8f3a-4d6b-9e0c-1a2b3c4d5e6f", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 9, m)).toISOString()
const LINKED = "0c4a0000-0000-4000-8000-000000000005"
const id = (n: number) => `0c4a0000-0000-4000-8000-00000000000${n}`
const chat = (n: number, by: typeof SAM | typeof MAYA, text: string) => ({
  chat_uuid: id(n), chat_from: by, chat_to: by === SAM ? MAYA : SAM, chat_created_at: at(n), chat_attachments: [], chat_comment_count: 0,
  chat_body_text: `<p>${text}</p>`, chat_reactions: [],
})
const conversation = [
  chat(1, MAYA, "Morning! Did the launch checklist land?"),
  chat(2, SAM, "It did. The rollback steps are in the Q4 launch doc."),
  chat(3, MAYA, "Great. Who's on call Friday?"),
  chat(4, SAM, "Jonas, with me as backup."),
  chat(5, MAYA, "Then we ship Friday at 10:00. I'll tell the channel."),
  chat(6, SAM, "Perfect."),
  chat(7, MAYA, "Pinned the plan so nobody has to hunt for it."),
]
const grouping = [SAM.user_uuid, MAYA.user_uuid].sort().join(" ")
const page = (chats: ReturnType<typeof chat>[], more = false) => ({ msg: "ok", data: { chats: [...chats].reverse(), has_more: more } })

// The composer's and header's own reads, answered so no stray toast sits in the shots.
const QUIET = {
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a draft from another device is back in its composer`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      await stubBackend(tab, testInfo, {
        ...QUIET,
        "/drafts": { msg: "ok", data: { drafts: [{ key: `dm:${grouping}`, html: "<p>Half a thought about Friday: the release notes</p>", updated_at: at(8) }], max: 500 } },
        [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
        [`/dm/latestChat/${MAYA.user_uuid}`]: page(conversation.slice(3)),
        "/dm/": { msg: "ok", data: [] },
        "/user/dm-ai-suggestions": { msg: "ok", data: [] },
      })
      const puts: Request[] = []
      tab.on("request", (r) => {
        if (r.method() === "PUT" && r.url().includes("/drafts")) puts.push(r)
      })
      await tab.goto(`/app/chat/${MAYA.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(tab.getByText("Then we ship Friday at 10:00.")).toBeVisible({ timeout: 60_000 })
      // The draft written on the phone is in the box, and isn't sent back.
      await expect(tab.getByText("Half a thought about Friday: the release notes")).toBeVisible({ timeout: 20_000 })
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/dm-draft-restored-${view.name}-${scheme}.png` })
      await tab.waitForTimeout(1_600)
      expect(puts).toHaveLength(0)
      await context.close()
    })
  }
}

for (const scheme of ["light", "dark"] as const) {
  test(`at 1280, ${scheme}: a link opens its message in place, lit up`, async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const context = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL), viewport: { width: 1280, height: 860 }, colorScheme: scheme })
    const tab = await context.newPage()
    await stubBackend(tab, testInfo, {
      ...QUIET,
      [`/user/profile/${MAYA.user_uuid}`]: { msg: "ok", data: MAYA },
      // The link's page: the message and what followed it; then what led to it.
      [`/dm/newChatsIncludingCurrentChat/${MAYA.user_uuid}/${LINKED}`]: page(conversation.slice(4)),
      [`/dm/oldChats/${MAYA.user_uuid}`]: page(conversation.slice(0, 4)),
      [`/dm/chatWithAllComments/${LINKED}`]: { msg: "ok", data: { ...conversation[4], chat_comments: [] } },
      "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
      "/dm/": { msg: "ok", data: [] },
      "/user/dm-ai-suggestions": { msg: "ok", data: [] },
    })
    await tab.goto(`/app/chat/${MAYA.user_uuid}/${LINKED}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const linked = tab.locator(`#msg-${LINKED}`)
    await expect(linked).toBeVisible({ timeout: 60_000 })
    await expect(linked).toHaveAttribute("data-highlighted", "", { timeout: 10_000 })
    if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/dm-link-in-place-1280-${scheme}.png` })
    // In the middle of the list, not at its top or bottom.
    const list = tab.locator("[data-message-viewport]").first()
    const [box, row] = [await list.boundingBox(), await linked.boundingBox()]
    expect(box && row).toBeTruthy()
    const middle = row!.y + row!.height / 2 - box!.y
    expect(middle).toBeGreaterThan(box!.height * 0.2)
    expect(middle).toBeLessThan(box!.height * 0.8)
    // The list is a region a keyboard reaches, named for its conversation.
    await expect(list).toHaveAttribute("role", "region")
    await expect(list).toHaveAttribute("tabindex", "0")
    await context.close()
  })
}
