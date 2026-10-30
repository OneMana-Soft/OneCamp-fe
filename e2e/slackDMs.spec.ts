import { expect, test, type Page } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"

// Bringing your Slack DMs (chat item 2), in a real browser with no backend: a
// member starts a read from Settings with their own token, follows it, and
// sees what came across; an admin sees in the import history whose DMs came
// across, and not what's in them. With SHOTS=<dir> each is saved at 1280 and
// 390, light and dark.

const TOKEN = "xoxp-1111-2222-3333-abcdefabcdef"
const READ_ID = "7b2e0000-0000-4000-8000-000000000001"

const read = (over: Record<string, unknown>) => ({
  id: READ_ID,
  slack_workspace_name: "Acme",
  source: "api",
  options: { member_dms: true },
  created_at: "2026-10-21T06:00:00Z",
  updated_at: "2026-10-21T06:05:00Z",
  chunks_total: 0,
  chunks_done: 0,
  chunks_failed: 0,
  items_imported: 0,
  errors_total: 0,
  ...over,
})

const READING = read({ status: "pending", stage: "reading", progress: { read: { conversations: 9, of: 23, messages: 1840, replies: 96, files: 4 } } })
const BROUGHT = read({
  status: "completed",
  stage: "finalize",
  completed_at: "2026-10-21T06:20:00Z",
  errors_total: 1,
  progress: { read: { dms: 14, mpims: 5, groups: 4, conversations: 23, of: 23, messages: 6120, replies: 310, files: 22 } },
})
const NOTE = {
  id: "n1",
  severity: "warning",
  code: "API_FILE_NOT_READ",
  message: "Slack didn't give the file Q4 plan (it lives in Google Drive), so it stays a link.",
  created_at: "2026-10-21T06:10:00Z",
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a member brings their Slack DMs, and an admin sees whose`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      let reads: unknown[] = []
      const sent: unknown[] = []
      tab.on("request", (r) => {
        if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/me/slack/dms")) sent.push(r.postDataJSON())
      })
      await stubBackend(tab, testInfo, {
        "/me/slack/dms": (url: URL, request: { method(): string }) => {
          if (url.pathname.endsWith("/notes")) return { notes: [NOTE] }
          if (request.method() === "POST") return { job_id: READ_ID }
          return { reads, team_imported: true }
        },
        "/connectors": { connectors: [] },
      })
      const shot = async (name: string, el: ReturnType<Page["getByRole"]>) => {
        if (process.env.SHOTS) await el.screenshot({ path: `${process.env.SHOTS}/slack-dms-${name}-${view.name}-${scheme}.png` })
      }

      // Nothing brought yet: the card, its words, and the token's form.
      await tab.goto("/app/settings/connectors", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const card = tab.getByRole("region", { name: "Your Slack DMs" })
      await expect(card.getByText("Not brought yet")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      await expect(card.getByText("Your DMs, group DMs and private channels, each private to its people")).toBeVisible()
      await card.getByRole("button", { name: "Bring my DMs" }).click()
      // Before the token, the form says it all.
      await expect(card.getByText(/The other people's messages in them come across too/)).toBeVisible()
      await card.getByLabel("Your Slack user token").fill(TOKEN)
      await card.getByText("How to get a token").click()
      await expect(card.getByText("OneCamp DMs", { exact: false })).toBeVisible()
      await card.scrollIntoViewIfNeeded()
      await shot("form", card)
      // The form's end, its buttons above the phone's bar.
      await card.getByRole("button", { name: "Start" }).scrollIntoViewIfNeeded()
      if (process.env.SHOTS) await tab.screenshot({ path: `${process.env.SHOTS}/slack-dms-form-end-${view.name}-${scheme}.png` })
      reads = [READING]
      await card.getByRole("button", { name: "Start" }).click()
      await expect(card.getByText("Reading from Slack: 9 of 23 conversations.")).toBeVisible()
      expect(sent).toEqual([{ token: TOKEN }])
      await shot("reading", card)

      // Brought: what came across, and what Slack didn't give.
      reads = [BROUGHT]
      await tab.reload({ waitUntil: "domcontentloaded" })
      await expect(card.getByText("Brought 14 DMs, 5 group DMs and 4 private channels on 21 Oct.")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      await card.getByText("What Slack didn't give (1)").click()
      await expect(card.getByText(/it lives in Google Drive/)).toBeVisible()
      await shot("brought", card)
      await context.close()
    })

    test(`at ${view.name}, ${scheme}: the admins' history names whose DMs came across, and nothing in them`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      await stubBackend(tab, testInfo, {
        "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
        "/admin/import/slack/jobs": {
          jobs: [
            { ...BROUGHT, id: "7b2e0000-0000-4000-8000-000000000002", member_name: "Bo Diddley", progress: { read: { dms: 14, mpims: 5, groups: 4, conversations: 23, of: 23, messages: 6120, replies: 310, files: 22 } } },
            { ...READING, id: "7b2e0000-0000-4000-8000-000000000003", member_name: "Ada Lovelace", stage: "queued", progress: {} },
          ],
        },
        "/admin/import/slack/limits": { max_bytes: 5 * 1024 ** 3 },
        "/admin/import/jobs": { jobs: [] },
      })
      await tab.goto("/app/admin?tab=import", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const history = tab.getByRole("list", { name: "Slack imports" })
      await expect(history.getByText("Bo Diddley's own DMs")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      await expect(history.getByText("Ada Lovelace's own DMs")).toBeVisible()
      await expect(history.getByText("23 conversations")).toBeVisible()
      await expect(history.getByText("Queued", { exact: true })).toBeVisible()
      await expect(history.getByRole("button", { name: /^(Plan|Run)/ })).toHaveCount(0)
      await expect(history.getByText("1 error")).toHaveCount(0)
      if (process.env.SHOTS) await history.screenshot({ path: `${process.env.SHOTS}/slack-dms-admin-${view.name}-${scheme}.png` })
      await context.close()
    })
  }
}
