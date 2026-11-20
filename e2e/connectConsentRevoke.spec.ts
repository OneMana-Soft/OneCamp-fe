import { expect, test, type Page } from "@playwright/test"
import { AI_ON, SHOT_THEMES, expectEveryCallAnswered, stubBackend, untilStill } from "./stubbedApp"

// ADMIN-13: the consent page told everyone to take an agent back in Admin,
// which a member can't open. An admin is sent to Admin › Agent inventory, a
// member to their own Settings › Your AI assistants, where Disconnect is.

const REQ = "3f2a4c1e-9b7d-4e2a-8c1f-0a1b2c3d4e5f"
const consent = (isAdmin: boolean) => ({
  msg: "ok",
  data: {
    client_name: "Claude",
    redirect_host: "claude.ai",
    scopes: ["tasks:read", "tasks:write"],
    agents: [],
    surface_enabled: true,
    is_admin: isAdmin,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  },
})

const views = [
  { name: "1280", viewport: { width: 1280, height: 900 }, phone: false },
  { name: "390 with touch", viewport: { width: 390, height: 844 }, phone: true },
] as const

/** The card alone, before anything is checked, so a run on the old page still leaves its frame. */
async function shoot(page: Page, name: string, scheme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await untilStill(page)
  await page.locator("[data-consent-card]").screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${scheme}.png` })
}

for (const view of views) {
  for (const scheme of SHOT_THEMES) {
    test(`at ${view.name}, ${scheme}: the consent page sends each person where they can take the agent back`, async ({ browser }, testInfo) => {
      test.setTimeout(180_000)
      const context = await browser.newContext({
        baseURL: String(testInfo.project.use.baseURL),
        viewport: view.viewport,
        colorScheme: scheme,
        ...(view.phone ? { isMobile: true, hasTouch: true } : {}),
      })
      const tab = await context.newPage()
      let admin = false
      await stubBackend(tab, testInfo, { ...AI_ON, "/oauth/requests/": () => consent(admin) })

      for (const who of ["member", "admin"] as const) {
        admin = who === "admin"
        await tab.goto(`/connect/authorize?request=${REQ}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(tab.getByRole("button", { name: "Connect Claude" })).toBeEnabled({ timeout: 60_000 })
        await expect(tab.getByRole("button", { name: "Don't connect" })).toBeEnabled()
        await shoot(tab, `consent-${who}`, scheme)

        const place = admin ? "Admin › Agent inventory" : "Settings › Your AI assistants"
        const link = tab.getByRole("link", { name: place })
        await expect(link).toHaveAttribute("href", admin ? "/app/admin?tab=ai-models#ai-models-inventory" : "/app/settings/assistants")
        await expect(link.locator("xpath=ancestor::p[1]")).toContainText(admin ? `Pause or revoke it any time in ${place}.` : `Disconnect it any time in ${place}.`)
        if (!admin) await expect(tab.getByText(/Admin › Agent inventory/)).toHaveCount(0)
      }
      await expectEveryCallAnswered(tab)
      await context.close()
    })
  }
}
