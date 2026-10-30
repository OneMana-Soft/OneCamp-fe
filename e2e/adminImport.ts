import type { Page, Request, TestInfo } from "@playwright/test"

import { SAM, stubBackend, type Answers } from "./stubbedApp"

// The admin's import page with Basecamp among its providers (basecamp-46), signed in there or not. Back from its
// sign-in ("&connected=basecamp") Basecamp is connected and lists two accounts to bring.

const ADMIN = { ...SAM, user_is_admin: true }
const NOT_SET_UP =
  "Signing in to Basecamp isn't set up on this server. Register an app at launchpad.37signals.com/integrations, then set BASECAMP_OAUTH_CLIENT_ID and BASECAMP_OAUTH_CLIENT_SECRET."
const JOB_ID = "5a7e0000-0000-4000-8000-000000000002"

const provider = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  sources: ["api"],
  capabilities: ["projects", "tasks", "subtasks", "task_comments", "attachments"],
  default_status_map: {},
  default_priority_map: {},
  ...extra,
})

/**
 * The import page on a stubbed server; what the page sent comes back in the
 * state. `more` answers anything else the test's page reads (the import review).
 */
export async function importPage(page: Page, testInfo: TestInfo, configured: boolean, search = "", more: Answers = {}) {
  // Back from Basecamp, the sign-in is saved: Basecamp is connected and lists its accounts.
  const state: { connected: boolean; job?: Record<string, unknown> } = { connected: search.includes("connected=basecamp") }
  // The sign-in page, as the server's callback leaves it: back on the import page, connected.
  const back = new URL("/app/admin?tab=import&connected=basecamp", String(testInfo.project.use.baseURL)).href
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: ADMIN },
    "/admin/import/providers": {
      providers: [provider("asana"), provider("basecamp", { sign_in: configured ? { configured: true } : { configured: false, setup: NOT_SET_UP } }), provider("jira")],
    },
    "/admin/import/connections": () => ({
      connections: state.connected
        ? [{ provider: "basecamp", source_account_name: "Acme", created_at: "2026-10-20T09:00:00Z", updated_at: "2026-10-20T09:00:00Z" }]
        : [],
    }),
    "/admin/import/basecamp/discover": { items: [{ id: "999", name: "Acme", kind: "account", url: "https://3.basecamp.com/999" }, { id: "1001", name: "Acme Studio", kind: "account" }] },
    "/admin/import/basecamp/oauth-url": () => {
      state.connected = true
      return { url: back }
    },
    "/admin/import/basecamp/jobs": (_: URL, r: Request) => {
      state.job = JSON.parse(r.postData() || "{}") as Record<string, unknown>
      return { job_id: JOB_ID }
    },
    "/admin/import/jobs": { jobs: [] },
    "/admin/import/slack/jobs": { jobs: [] },
    "/admin/import/slack/limits": { max_bytes: 2147483648 },
    // The export card under the imports.
    "/admin/docs/exports": { exports: [] },
    ...more,
  })
  // The keys tip would sit over the shots (onboarding/KeyboardTip).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/admin?tab=import${search}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return state
}
