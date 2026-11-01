import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { expectSeen } from "./sheetLayout"
import { AI_ON, AI_READS, SAM, stubBackend } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// What rides on an AI DM's message box (V-125, from DESIGN-BUILD-48's read of head 5c): the starters to ask in a DM
// with nothing in it yet, and the actions an agent waits on (PendingActionsTray). On a phone they ride in the message
// sheet with the box; drawn in the page under the sheet, nobody saw them. Each is seen and on top, a finger's tap
// takes 44px and reaches over nothing beside it, and with three actions waiting the box is still there to type in.
// With SHOTS_DIR each state is saved at 1280 and 390 (touch), light and dark.

const ATLAS = { user_uuid: "7d3f9e4a-0b5c-4f6d-8e1a-3c4d5e6f7081", user_name: "Atlas", user_full_name: "Atlas", user_email_id: "atlas@example.com", is_bot: true }
const DM = [SAM.user_uuid, ATLAS.user_uuid].sort().join(" ")
const STARTERS = ["What is due this week?", "Summarise launch since Monday", "Draft the release note"]
const HELLO = "0c4a0000-0000-4000-8000-000000000031"
const chats = [{
  chat_uuid: HELLO, chat_from: ATLAS, chat_to: SAM, chat_created_at: new Date(Date.now() - 600_000).toISOString(), chat_comment_count: 0,
  chat_body_text: "<p>I can file these for you.</p>", chat_reactions: [], chat_attachments: [],
}]
const waiting = (n: number) => ({
  id: `0c4a0000-0000-4000-8000-00000000004${n}`, requested_by: SAM.user_uuid, surface_type: "dm", surface_id: DM, tool_name: "create_task",
  params: { title: `Follow up ${n}` }, description: `Create the task "Follow up ${n}" in Launch`, status: "pending",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(), created_at: new Date(Date.now() - 60_000).toISOString(),
})
const QUIET = {
  ...AI_ON,
  ...AI_READS,
  "/command/catalog": { msg: "ok", data: { commands: [] } },
  "/message/scheduled": { msg: "ok", data: [] },
  "/user/notificationStatus": { msg: "ok", data: {} },
  "/ai/voice-input": { msg: "ok", data: {} },
  "/pins": { msg: "ok", data: { pins: [], can_pin: true, max: 100 } },
  "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
  "/dm/": { msg: "ok", data: [] },
  [`/user/profile/${ATLAS.user_uuid}`]: { msg: "ok", data: ATLAS },
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const
type View = (typeof views)[number]

/** Sam's DM with the agent Atlas at a width and scheme, holding `said` (none: a DM with nothing in it yet). */
async function openAgentDm(browser: Browser, testInfo: TestInfo, view: View, scheme: "light" | "dark", said: typeof chats, answers: Record<string, unknown>) {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL), viewport: view.viewport, colorScheme: scheme,
    ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  const page = await context.newPage()
  await stubBackend(page, testInfo, { ...QUIET, [`/dm/latestChat/${ATLAS.user_uuid}`]: { msg: "ok", data: { chats: said, has_more: false } }, ...answers })
  await page.goto(`/app/chat/${ATLAS.user_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { context, page }
}

/** The box itself, where words are typed. */
const box = (page: Page, view: View) => (view.phone ? page.locator("[data-phone-composer] [contenteditable='true']") : page.locator("[contenteditable='true']").last())

/** On a phone: every control in the sheet takes a finger's tap across 44px, and none reaches over another. */
async function reachesClear(page: Page, names: string[]) {
  const reaches = await reachesIn(page, "[data-composer-sheet]")
  for (const name of names) expect(reaches.map((r) => r.name)).toContain(name)
  expect(overlapping(reaches)).toEqual([])
}

async function shot(page: Page, name: string, view: View, scheme: string) {
  const dir = process.env.SHOTS_DIR || process.env.SHOTS
  if (dir) await page.screenshot({ path: `${dir}/dm-extras-${name}-${view.name}-${scheme}.png` })
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: an empty AI DM's starters sit on its box, seen, and one asks it`, async ({ browser }, testInfo) => {
      test.setTimeout(150_000)
      const asked: string[] = []
      const { context, page } = await openAgentDm(browser, testInfo, view, scheme, [], {
        "/user/dm-ai-suggestions": { msg: "ok", data: STARTERS },
        "/ai/pending-actions": { msg: "ok", data: [] },
        "/dm/createChat": (_url: URL, request: { postData: () => string | null }) => {
          asked.push(request.postData() ?? "")
          return { msg: "ok", data: {} }
        },
      })
      await expectSeen(page.getByText("Try asking", { exact: true }))
      for (const s of STARTERS) await expectSeen(page.getByRole("button", { name: s, exact: true }))
      await expectSeen(box(page, view))
      if (view.phone) await reachesClear(page, STARTERS)
      await shot(page, "starters", view, scheme)

      const first = page.getByRole("button", { name: STARTERS[0], exact: true })
      await (view.phone ? first.tap() : first.click())
      await expect.poll(() => asked.length).toBe(1)
      expect(asked[0]).toContain(STARTERS[0])
      await context.close()
    })

    for (const count of [1, 3]) {
      test(`at ${view.name}, ${scheme}: ${count} action${count > 1 ? "s" : ""} an agent waits on sit${count > 1 ? "" : "s"} on the box, seen, and the box is still there to type in`, async ({ browser }, testInfo) => {
        test.setTimeout(150_000)
        const { context, page } = await openAgentDm(browser, testInfo, view, scheme, chats, {
          "/user/dm-ai-suggestions": { msg: "ok", data: [] },
          "/ai/pending-actions": { msg: "ok", data: Array.from({ length: count }, (_, i) => waiting(i + 1)) },
        })
        await expect(page.locator(`#msg-${HELLO}`).getByText("I can file these for you.")).toBeVisible({ timeout: 60_000 })
        for (let n = 1; n <= count; n++) await expectSeen(page.getByText(`Create the task "Follow up ${n}" in Launch`, { exact: true }))
        const approve = page.getByRole("button", { name: "Approve", exact: true })
        await expect(approve).toHaveCount(count)
        for (let i = 0; i < count; i++) {
          await expectSeen(approve.nth(i))
          await expectSeen(page.getByRole("button", { name: "Dismiss", exact: true }).nth(i))
        }
        const words = box(page, view)
        await expectSeen(words)
        await (view.phone ? words.tap() : words.click())
        await page.keyboard.type("Approve the first one")
        await expect(words).toContainText("Approve the first one")
        if (view.phone) await reachesClear(page, ["Approve", "Dismiss"])
        await shot(page, `actions-${count}`, view, scheme)
        await context.close()
      })
    }
  }
}
