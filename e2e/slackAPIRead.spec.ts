import { expect, test } from "@playwright/test"
import { SAM, stubBackend, tidy } from "./stubbedApp"

// A Slack workspace read through Slack's API (chat item 2), in a real browser
// with no backend: the import history shows a read under way and one that has
// read, and the import dialog starts a read with a token. With SHOTS=<dir>
// each is saved at 1280 and 390, light and dark.

const ADMIN = { ...SAM, user_is_admin: true }
const TOKEN = "xoxp-1111-2222-3333-abcdefabcdef"

const job = (id: string, over: Record<string, unknown>) => ({
  id,
  slack_workspace_name: "Acme",
  source: "api",
  options: {},
  created_at: "2026-10-21T06:00:00Z",
  updated_at: "2026-10-21T06:05:00Z",
  chunks_total: 0,
  chunks_done: 0,
  chunks_failed: 0,
  items_imported: 0,
  errors_total: 0,
  ...over,
})
const JOBS = [
  job("6a1f0000-0000-4000-8000-000000000001", {
    status: "pending",
    stage: "reading",
    progress: { read: { conversations: 12, of: 40, messages: 3100, replies: 110, files: 15 } },
  }),
  job("6a1f0000-0000-4000-8000-000000000002", {
    slack_workspace_name: "Acme (DMs)",
    status: "validating",
    stage: "validating",
    progress: { read: { conversations: 40, of: 40, messages: 9000, replies: 400, files: 0 } },
  }),
]

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: a read through Slack's API, started and under way`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      const reads: unknown[] = []
      tab.on("request", (r) => {
        if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/admin/import/slack/api-read")) reads.push(r.postDataJSON())
      })
      await stubBackend(tab, testInfo, {
        "/user/profile": { msg: "ok", data: ADMIN },
        "/admin/import/slack/jobs": { jobs: JOBS },
        "/admin/import/slack/limits": { max_bytes: 5 * 1024 ** 3 },
        "/admin/import/slack/api-read": { job_id: "6a1f0000-0000-4000-8000-000000000003", slack_workspace_name: "Acme" },
        "/admin/import/jobs": { jobs: [] },
      })

      await tab.goto("/app/admin?tab=import", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const history = tab.getByRole("list", { name: "Slack imports" })
      await expect(history.getByText("12 of 40 conversations")).toBeVisible({ timeout: 60_000 })
      await tidy(tab)
      await expect(history.getByText("Reading", { exact: true })).toBeVisible()
      await expect(history.getByText("through Slack's API")).toBeVisible()
      await expect(history.getByRole("button", { name: "Plan" })).toBeVisible()
      if (process.env.SHOTS) await history.screenshot({ path: `${process.env.SHOTS}/slack-read-history-${view.name}-${scheme}.png` })

      await tab.getByRole("button", { name: "New import" }).click()
      const dialog = tab.getByRole("dialog")
      await dialog.getByRole("radio", { name: "Slack's API" }).click()
      await expect(dialog.getByRole("heading", { name: "Read a Slack workspace" })).toBeVisible()
      await dialog.getByLabel("Slack workspace name").fill("Acme")
      await dialog.getByLabel("Slack token").fill(TOKEN)
      if (process.env.SHOTS) await dialog.screenshot({ path: `${process.env.SHOTS}/slack-read-dialog-${view.name}-${scheme}.png` })
      await dialog.getByText("How to get a token").click()
      await expect(dialog.getByText("users:read.email", { exact: false })).toBeVisible()
      if (process.env.SHOTS) await dialog.screenshot({ path: `${process.env.SHOTS}/slack-read-help-${view.name}-${scheme}.png` })

      await dialog.getByRole("button", { name: "Start the read" }).click()
      await expect(dialog).toBeHidden()
      expect(reads).toEqual([{ slack_workspace_name: "Acme", token: TOKEN }])
      await context.close()
    })
  }
}
