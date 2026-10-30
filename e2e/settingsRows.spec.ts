import { expect, test } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// Settings rows, as a person sees them (DESIGN-BUILD-6, 22 Oct 2026):
//   - a row's description shows two lines at most (components/ui/
//     settingsSection clamps it), so longer copy belongs to its section's
//     description: at 390 the read receipts row lost "Off, neither side sees it.";
//   - Search settings lands on the field, in view: on a page still filling in,
//     the jump could only scroll as far as the page then went, and a card that
//     filled in above the field pushed it off the foot of the screen
//     (hooks/jumpHold);
//   - the field it lands on wears a halo while it is marked: the halo reached
//     past the row, and its card clips what reaches past its edge, so on a
//     card of one row nothing showed.

const answers = {
  "/user/allUsers": { msg: "ok", users: [SAM] },
  "/me/keywords": { msg: "ok", data: [] },
  "/me/vips": { msg: "ok", data: [] },
  // The profile page's own reads, so no "Not found" toast stands over the page.
  "/auth/2fa": { msg: "ok", data: { enrolled: false } },
  "/auth/has-password": { has_password: true },
  "/auth/passkeys": { msg: "ok", data: [] },
  "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false, taskSyncEnabled: false } },
  "/user/notificationPreferences": (_: URL, request: { method: () => string }) =>
    request.method() === "GET" ? { msg: "ok", data: { read_receipts: true, read_receipts_allowed: true } } : { msg: "ok" },
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("Search settings lands on the field, in view, as the page fills in", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    // Keywords and VIPs, above the field, fill in once the jump has landed.
    let fillIn = () => {}
    const filled = new Promise<void>((resolve) => (fillIn = () => resolve()))
    const keywords = ["budget", "Q4 plan", "launch", "invoice", "renewal", "outage", "pricing", "hiring", "roadmap", "security review"]
    await stubBackend(page, testInfo, { ...answers, "/me/keywords": () => filled.then(() => ({ msg: "ok", data: keywords })) })
    await page.goto("/app/settings/profile", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByLabel("Search settings").fill("read receipts", { timeout: 60_000 })
    const hits = page.getByRole("navigation", { name: "Settings search results" })
    await hits.locator("[data-hit-field]").filter({ hasText: "Send and see read receipts" }).first().click()
    await page.waitForURL(/\/app\/settings\/notifications/, { timeout: 60_000 })
    const field = page.getByRole("switch", { name: /Send and see read receipts/ })
    await expect(field).toBeFocused({ timeout: 30_000 })
    fillIn()
    await expect(page.getByText("security review").first()).toBeVisible({ timeout: 30_000 })
    await expect(field).toBeInViewport({ ratio: 1 })
  })

  test("the field a jump lands on wears its halo, inside its card", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await stubBackend(page, testInfo, answers)
    // Reduced motion: the halo holds, unfaded, while the row is marked.
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/app/settings/notifications#read-receipts", { waitUntil: "domcontentloaded", timeout: 120_000 })
    const marked = page.locator("[data-setting-row].set-flash")
    await expect(marked).toHaveCount(1, { timeout: 60_000 })
    // The halo's whole reach (its box-shadow's widest spread around the row's
    // ::after) lies inside the card, which clips anything past its edge.
    const reach = await marked.evaluate((row) => {
      const card = row.closest("[data-settings-card]")!.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      const after = getComputedStyle(row, "::after")
      const spread = Math.max(0, ...[...after.boxShadow.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])))
      const halo = {
        top: r.top + parseFloat(after.top) - spread,
        left: r.left + parseFloat(after.left) - spread,
        bottom: r.bottom - parseFloat(after.bottom) + spread,
        right: r.right - parseFloat(after.right) + spread,
      }
      return { spread, inside: halo.top >= card.top - 0.5 && halo.left >= card.left - 0.5 && halo.bottom <= card.bottom + 0.5 && halo.right <= card.right + 0.5 }
    })
    expect(reach.spread).toBeGreaterThan(0)
    expect(reach.inside).toBe(true)
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("every row's description on Notifications shows in full", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await stubBackend(page, testInfo, answers)
    await page.goto("/app/settings/notifications", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.getByRole("switch", { name: /Send and see read receipts/ })).toBeVisible({ timeout: 60_000 })
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('p.line-clamp-2[id$="-desc"]')].map((p) => ({ id: p.id, cut: p.scrollHeight > p.clientHeight + 1, words: p.textContent })),
    )
    expect(rows.map((r) => r.id)).toContain("read-receipts-desc")
    expect(rows.filter((r) => r.cut).map((r) => r.words)).toEqual([])
  })
})
