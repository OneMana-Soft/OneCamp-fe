import { expect, test, type Page, type Request } from "@playwright/test"
import { footIsGutter } from "./sheetLayout"
import { SAM, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// An app's access in Admin › Apps (App Identity, chat row slack-19), in a real
// browser with no backend: the sheet from the app's row, a table added to
// where it may reach, and a token made, shown once, rotated and revoked. On a
// phone each dialog is the shared sheet with its actions pinned in reach.
// With SHOTS_DIR=<dir> each step is saved at 1280 and 390, light and dark.

const ADMIN = { ...SAM, user_is_admin: true }
const APP = "3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const DOC = "7d1e5c2a-9b3f-4a6e-8c1d-2f4b6a8e0c3d"
const TABLE = "0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a0b"
const SECRET = "oc_app_9f2c4d6e8a0b1c3d5e7f"
const ROTATED = "oc_app_1a3c5e7b9d2f4a6c8e0b"

const ROW = {
  id: APP,
  slug: "deploys",
  name: "Deploys",
  description: "Posts each deploy to #ops.",
  kind: "external",
  has_signing_secret: true,
  has_oauth_config: false,
  is_enabled: true,
  is_connected: false,
  commands: [],
}

type Place = { kind: string; id: string; title?: string; app_opens?: boolean }
type Token = { id: string; name: string; token_prefix: string; scopes: string[]; created_at: string; expires_at: string }

/** The server's side of one app: its access as Admin › Apps reads and changes it. */
function serverApp() {
  const titles: Record<string, string> = { [DOC]: "Launch notes", [TABLE]: "Vendors" }
  const app = {
    scopes: ["docs:read", "tasks:read"],
    places: [{ kind: "doc", id: DOC, title: titles[DOC], app_opens: true }] as Place[],
    tokens: [] as Token[],
    // Its access version, which each change moves on, and a change must name (If-Match).
    version: 1,
  }
  const identity = () => ({
    data: {
      identity: {
        app_id: APP,
        slug: "deploys",
        name: "Deploys",
        enabled: true,
        bot_user_id: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b",
        access_version: `v${app.version}`,
        scopes: app.scopes,
        audience: { places: app.places, public: false },
      },
      tokens: app.tokens,
    },
  })
  const answer = (url: URL, request: Request) => {
    const path = url.pathname
    const method = request.method()
    if (path.endsWith(`/apps/${APP}/identity`)) return identity()
    if (path.endsWith(`/apps/${APP}/access`) && method === "PUT") {
      // As the server: a change made from a version the app no longer has is refused.
      if (request.headers()["if-match"] !== `"v${app.version}"`) return withStatus(412, { msg: "Someone changed what this app may do since you opened it." })
      app.version++
      const sent = request.postDataJSON() as { scopes: string[]; audience: { places: Place[] } }
      app.scopes = sent.scopes
      app.places = sent.audience.places.map((p) => ({ kind: p.kind, id: p.id, title: titles[p.id], app_opens: true }))
      return identity()
    }
    if (path.endsWith(`/apps/${APP}/tokens`) && method === "POST") {
      const sent = request.postDataJSON() as { name: string; scopes: string[] }
      const token = { id: "t1", name: sent.name, token_prefix: SECRET.slice(0, 11), scopes: sent.scopes, created_at: "2026-10-23T12:00:00Z", expires_at: "2027-01-21T12:00:00Z" }
      app.tokens = [token]
      return { data: { token, plaintext: SECRET } }
    }
    if (path.endsWith(`/apps/${APP}/tokens/t1/rotate`)) return { data: { plaintext: ROTATED } }
    if (path.endsWith(`/apps/${APP}/tokens/t1`) && method === "DELETE") {
      app.tokens = []
      return { msg: "Revoked: it stops working now." }
    }
    return { data: { apps: [ROW] } }
  }
  return { app, answer }
}

const views = [
  { name: "1280", viewport: { width: 1280, height: 860 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

/** On a phone a dialog is the shared sheet, and its actions sit in view without a scroll. */
async function inReach(tab: Page, dialogName: string, action: string, phone: boolean) {
  const dialog = tab.getByRole("dialog", { name: dialogName })
  await expect(dialog).toBeVisible()
  // The sheet's own element is the dialog (vaul's Content is Radix's), so it
  // carries the mark itself: a `has` filter looks only inside it.
  if (phone) await expect(dialog).toHaveAttribute("data-v3-sheet", "")
  // Its foot is its gutter, never under 16px: the one rule for every phone sheet (V-73).
  if (phone) await footIsGutter(dialog, dialogName)
  await expect(dialog.getByRole("button", { name: action })).toBeInViewport()
  return dialog
}

for (const view of views) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: an app's access, a place added, and a token made, rotated and revoked`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      await context.grantPermissions(["clipboard-read", "clipboard-write"])
      const tab = await context.newPage()
      const server = serverApp()
      await stubBackend(tab, testInfo, {
        "/user/profile": { msg: "ok", data: ADMIN },
        "/admin/apps": server.answer,
        "/admin/marketplace": { data: { apps: [] } },
        "/api-tokens/scopes": { data: ["docs:read", "tasks:read", "tasks:write"] },
        "/tables": { data: [{ id: TABLE, name: "Vendors" }] },
      })

      await tab.goto("/app/admin?tab=apps", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const access = tab.getByRole("button", { name: "Access and tokens for Deploys" })
      await expect(access).toBeVisible({ timeout: 60_000 })
      // A finger's reach on a phone: the row's icon buttons are 44px there.
      if (view.phone) {
        for (const name of ["Access and tokens for Deploys", "Edit Deploys", "Remove Deploys"]) {
          expect((await tab.getByRole("button", { name }).boundingBox())?.height).toBeGreaterThanOrEqual(44)
        }
      }
      await access.click()
      const sheet = tab.getByRole("dialog", { name: "Deploys" })
      await expect(sheet.getByText("Deploys acts as its own user")).toBeVisible({ timeout: 60_000 })
      await expect(sheet.getByRole("list", { name: "Where Deploys may reach" }).getByText("Launch notes")).toBeVisible()
      await reviewShot(tab, "app-access-sheet", scheme)

      // A table added to where it may reach, from the admin's own tables.
      await sheet.getByRole("button", { name: "Add a doc or table" }).click()
      const picker = await inReach(tab, "Add a doc or table to Deploys", "Cancel", view.phone)
      await picker.getByRole("radio", { name: "Tables" }).click()
      await expect(picker.getByRole("option", { name: "Vendors" })).toBeVisible()
      await reviewShot(tab, "app-access-picker", scheme)
      await picker.getByRole("option", { name: "Vendors" }).click()
      await expect(picker).toBeHidden()
      await expect(sheet.getByRole("list", { name: "Where Deploys may reach" }).getByText("Vendors")).toBeVisible()
      expect(server.app.places.map((p) => p.id)).toEqual([DOC, TABLE])

      // A token: a name, then the secret once; closing before copying asks.
      await sheet.getByRole("button", { name: "New token" }).click()
      const form = await inReach(tab, "New token for Deploys", "Make token", view.phone)
      await form.getByRole("textbox", { name: "Name" }).fill("Production server")
      await reviewShot(tab, "app-access-token-form", scheme)
      await form.getByRole("button", { name: "Make token" }).click()
      const made = await inReach(tab, "Token made", "Done", view.phone)
      await expect(made.getByText(SECRET)).toBeVisible()
      await made.getByRole("button", { name: "Done" }).click()
      await expect(tab.getByRole("alertdialog", { name: "Close without copying?" })).toBeVisible()
      if (view.phone) await footIsGutter(tab.getByRole("alertdialog", { name: "Close without copying?" }), "Close without copying?")
      await tab.getByRole("button", { name: "Go back" }).click()
      await made.getByRole("button", { name: "Copy token" }).click()
      await expect(made.getByRole("button", { name: "Token copied" })).toBeVisible()
      expect(await tab.evaluate(() => navigator.clipboard.readText())).toBe(SECRET)
      await reviewShot(tab, "app-access-token-made", scheme)
      await made.getByRole("button", { name: "Done" }).click()
      await expect(made).toBeHidden()
      const tokens = sheet.getByRole("list", { name: "Tokens for Deploys" })
      await expect(tokens.getByText("Production server")).toBeVisible()

      // Rotated after asking: the new secret, once.
      await tokens.getByRole("button", { name: "Actions for Production server" }).click()
      await tab.getByRole("menuitem", { name: "Rotate…" }).click()
      await tab.getByRole("button", { name: "Rotate token" }).click()
      const rotated = await inReach(tab, "New secret for Production server", "Done", view.phone)
      await expect(rotated.getByText(ROTATED)).toBeVisible()
      await rotated.getByRole("button", { name: "Copy token" }).click()
      await reviewShot(tab, "app-access-rotated", scheme)
      await rotated.getByRole("button", { name: "Done" }).click()
      await expect(rotated).toBeHidden()

      // Revoked after asking.
      await tokens.getByRole("button", { name: "Actions for Production server" }).click()
      await tab.getByRole("menuitem", { name: "Revoke…" }).click()
      await tab.getByRole("button", { name: "Revoke token" }).click()
      await expect(sheet.getByText("No tokens yet.", { exact: false })).toBeVisible()
      expect(server.app.tokens).toEqual([])
      await context.close()
    })
  }
}
