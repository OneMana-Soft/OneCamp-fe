import { expect, test, type Locator, type Request } from "@playwright/test"
import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// Bringing an Airtable base (tables T-AT), in a real browser with no backend:
// the admin's import card lists Airtable, and Basecamp, among the tools the
// server offers; Airtable's connect dialog says which token to make and where,
// and sends it; the base picked goes into the job (none picked means every
// base the token reaches); and the plan that opens counts the tables that come
// across. With SHOTS_DIR set, each step is saved at 1280 and 390, light and
// dark, for the design review.

const TOKEN = "patT0k3nForTheLaunchBase.0123456789abcdef"
const JOB_ID = "5a7e0000-0000-4000-8000-000000000001"
const BASES = [
  { id: "appLaunchPlan0001", name: "Launch plan" },
  { id: "appVendorList0002", name: "Vendors" },
]

const provider = (name: string, capabilities: string[]) => ({ name, sources: ["api"], capabilities, default_status_map: {}, default_priority_map: {} })
// Every tool the importer takes, as the server lists them, so the shots show
// what ships (DESIGN-BUILD-11's I2: seven cards under a paragraph naming 11).
const PROVIDERS = [
  provider("airtable", ["tables"]),
  provider("asana", ["projects", "tasks"]),
  provider("basecamp", ["projects", "tasks"]),
  provider("clickup", ["projects", "tasks"]),
  // Google Sheets signs in with the server's Google client.
  { ...provider("gsheets", ["tables"]), sign_in: { configured: true } },
  provider("jira", ["projects", "tasks"]),
  provider("linear", ["projects", "tasks"]),
  provider("miro", ["boards"]),
  provider("monday", ["projects", "tasks"]),
  provider("notion", ["projects", "tasks", "pages"]),
  provider("todoist", ["projects", "tasks"]),
  provider("trello", ["projects", "tasks"]),
]

const JOB = {
  id: JOB_ID,
  provider: "airtable",
  source_workspace_name: "Launch plan",
  source: "api",
  status: "pending",
  options: { bases: [BASES[0].id] },
  created_at: "2026-10-24T03:00:00Z",
  updated_at: "2026-10-24T03:00:00Z",
}
const PLAN = {
  user_count: 0,
  user_new: 0,
  user_merge: 0,
  team_count: 0,
  project_count: 0,
  task_count: 0,
  table_count: 3,
  subtask_count: 0,
  comment_count: 0,
  file_count: 12,
  file_bytes: 3_400_000,
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: an admin brings an Airtable base, and its plan counts the tables`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      // A finger on a phone, the pointer at a desk.
      const press = (l: Locator) => (view.phone ? l.tap() : l.click())
      const sent: Record<string, unknown> = {}
      let connected = false
      let created = false
      const bodyOf = (r: Request) => JSON.parse(r.postData() || "{}") as Record<string, unknown>
      await stubBackend(tab, testInfo, {
        "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
        "/admin/import/providers": { providers: PROVIDERS },
        "/admin/import/connections": () => ({ connections: connected ? [{ provider: "airtable", source_account_name: "Acme", updated_at: "2026-10-24T03:00:00Z" }] : [] }),
        "/admin/import/airtable/connect": (_: URL, r: Request) => {
          sent.connect = bodyOf(r)
          connected = true
          return { msg: "ok" }
        },
        "/admin/import/airtable/discover": { items: BASES },
        "/admin/import/airtable/jobs": (_: URL, r: Request) => {
          sent.job = bodyOf(r)
          created = true
          return { job_id: JOB_ID }
        },
        [`/admin/import/jobs/${JOB_ID}/plan`]: PLAN,
        "/admin/import/jobs": () => ({ jobs: created ? [JOB] : [] }),
        "/admin/import/slack/jobs": { jobs: [] },
        "/admin/import/slack/limits": { max_bytes: 5 * 1024 ** 3 },
      })
      await tab.goto("/app/admin?tab=import", { waitUntil: "domcontentloaded", timeout: 120_000 })

      // The tools the server offers: every one the card's words name has a
      // card to pick, and no other.
      const tools = tab.getByRole("radiogroup", { name: "Tool to import from" })
      await expect(tools.getByRole("radio", { name: "Airtable" })).toBeVisible({ timeout: 60_000 })
      const words = (await tab.getByText(/^Airtable, Asana, /).textContent()) ?? ""
      const named = words.slice(0, words.indexOf(". ")).split(/,\s*|\s+and\s+/)
      expect(named.length, words).toBeGreaterThan(5)
      for (const name of named) await expect(tools.getByRole("radio", { name, exact: true }), name).toBeVisible()
      await expect(tools.getByRole("radio")).toHaveCount(named.length)
      await expect(tools.getByRole("radio", { name: "Airtable" })).toContainText("Bases, tables, links, views")
      await tools.getByRole("radio", { name: "Airtable" }).scrollIntoViewIfNeeded()
      await reviewShot(tab, "import-tools", scheme)

      // Connect: which token, where, and what it may read.
      await press(tools.getByRole("radio", { name: "Airtable" }))
      // Chosen, a tool's card is selected in its own hue, its mark's (DESIGN-BUILD-12's
      // S3): the tint and a ring, where the others stay plain.
      const chosen = tools.getByRole("radio", { name: "Airtable", exact: true })
      await expect(chosen).toHaveAttribute("aria-checked", "true")
      const look = (card: typeof chosen) =>
        card.evaluate((el) => ({ hue: (el as HTMLElement).dataset.hue ?? null, tint: getComputedStyle(el).backgroundImage, ring: getComputedStyle(el).boxShadow }))
      const markHue = await chosen.locator("[data-source-mark]").getAttribute("data-hue")
      expect(markHue, "Airtable's mark wears a hue").toBeTruthy()
      expect((await look(chosen)).hue).toBe(markHue)
      // The selected ring is a 1.5px inset one; a dark card's lift has a 1px
      // inset light of its own, chosen or not.
      await expect.poll(async () => (await look(chosen)).ring, "the chosen card's ring").toContain("0px 0px 0px 1.5px inset")
      const other = await look(tools.getByRole("radio", { name: "Asana", exact: true }))
      expect(other.ring).not.toContain("1.5px inset")
      expect((await look(chosen)).tint).not.toBe(other.tint)
      await press(tab.getByRole("button", { name: "Connect Airtable" }))
      const dialog = tab.getByRole("dialog", { name: "Connect Airtable" })
      await expect(dialog.getByRole("link", { name: "Where to find them" })).toHaveAttribute("href", "https://airtable.com/create/tokens")
      await expect(dialog.getByText(/data\.records:read and schema\.bases:read/)).toBeVisible()
      await dialog.getByLabel("Access token").fill(TOKEN)
      await reviewShot(tab, "import-airtable-connect", scheme)
      await press(dialog.getByRole("button", { name: "Connect", exact: true }))
      await expect(dialog).toBeHidden()
      expect(sent.connect).toMatchObject({ access_token: TOKEN })

      // A base to pick, optional: none picked brings every base the token reaches.
      await expect(tab.getByText("Connected as Acme")).toBeVisible()
      // Disconnect keeps the line it shares with the account wherever it fits
      // (DESIGN-BUILD-12's S4: at 390 it dropped onto a line of its own).
      const account = (await tab.getByText("Connected as Acme").boundingBox())!
      const disconnect = (await tab.getByRole("button", { name: "Disconnect" }).boundingBox())!
      expect(Math.abs(account.y + account.height / 2 - (disconnect.y + disconnect.height / 2)), "Disconnect beside the account").toBeLessThan(disconnect.height / 2)
      // The app's own picker (B-1): a list over the card at a desk, a sheet on a phone.
      const pick = tab.getByRole("combobox", { name: "Pick an Airtable base (optional)" })
      await expect(pick).toHaveText("Choose one")
      await press(pick)
      await expect(tab.getByRole("option")).toHaveText(["Launch plan", "Vendors"])
      await reviewShot(tab, "import-airtable-pick-open", scheme)
      await press(tab.getByRole("option", { name: "Launch plan" }))
      await expect(pick).toHaveText("Launch plan")
      await expect(tab.getByLabel("Workspace name")).toHaveValue("Launch plan")
      // At 390 the field sits under the tools.
      await pick.scrollIntoViewIfNeeded()
      await reviewShot(tab, "import-airtable-pick", scheme)

      // Start: the job carries the base; its plan opens and counts the tables.
      await press(tab.getByRole("button", { name: "Start import" }))
      const plan = tab.getByRole("dialog", { name: "Plan the import of Launch plan" })
      await expect(plan.getByText("Tables", { exact: true })).toBeVisible({ timeout: 30_000 })
      expect(sent.job).toMatchObject({ source_workspace_name: "Launch plan", source: "api", options: { bases: [BASES[0].id] } })
      const tables = plan.locator("dt", { hasText: /^Tables$/ })
      await expect(tables.locator("xpath=following-sibling::dd[1]")).toHaveText("3")
      await reviewShot(tab, "import-airtable-plan", scheme)
      await context.close()
    })
  }
}
