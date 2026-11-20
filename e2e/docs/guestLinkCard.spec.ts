import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// The doc's "Anyone with the link" card is the board's shared GuestLinkSection
// (miro-33 gave the board's kind a third role, a password and Change): a doc's
// card keeps its two roles, no password and no Change, and still makes a link,
// on a phone with touch and on a computer. Every request is answered here.

const DOC = "4b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"

for (const screen of [
  { on: "a phone", width: 390, height: 844, isMobile: true, hasTouch: true },
  { on: "a computer", width: 1280, height: 900, isMobile: false, hasTouch: false },
] as const) {
  test(`on ${screen.on}, a doc's link card keeps its two roles, asks no password and makes a link`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const links = [{ id: "d1", capability: "view", expires_at: null, created_at: new Date().toISOString(), mine: true }]
    const made: Array<Record<string, unknown>> = []
    const access = { data: { doc_uuid: DOC, level: "full", owner: true, lock: "", locked: false, can_share: true, can_lock_soft: true, can_lock_hard: true, sharing: { owner: SAM, people: [], teams: [], general: { private: true, level: "view" }, everyone: "none" } } }
    const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Launch notes", body: "<p>The plan.</p>" }, {
      [`/doc/access/${DOC}`]: access,
      "/guest/links": (_url: URL, request: { method(): string; postDataJSON(): Record<string, unknown> | null }) => {
        if (request.method() === "GET") return { msg: "ok", data: links, publish_allowed: true, max_days: 0 }
        const body = request.postDataJSON() ?? {}
        made.push(body)
        links.unshift({ id: "d2", capability: String(body.capability), expires_at: null, created_at: new Date().toISOString(), mine: true })
        return { msg: "ok", data: { token: "doc-tok-2", grant_id: "g-d2", resource_type: "doc", resource_id: DOC, capability: body.capability, expires_at: null } }
      },
    }, screen)
    const { page } = tab
    // The phone (touch) in dark, the computer in light: both widths, both themes.
    if (screen.hasTouch) await page.emulateMedia({ colorScheme: "dark" })
    const press = (el: ReturnType<typeof page.getByRole>) => (screen.hasTouch ? el.tap() : el.click())
    if (screen.width < 640) {
      await page.getByRole("button", { name: "Document options" }).click()
      await page.getByText("Share", { exact: true }).click()
    } else {
      await page.locator("[data-doc-share]").click()
    }
    const card = page.locator("[data-share-dialog] [data-guest-link-card]")
    await expect(card).toBeVisible({ timeout: 60_000 })
    // The live link's row: its role and end, no password word, no Change.
    const row = card.locator("[data-link-row]")
    await expect(row).toContainText("Can view")
    await expect(row.locator("[data-link-facts]")).toHaveText("doesn't expire · yours")
    await expect(row).not.toContainText("Password")
    await expect(row.getByRole("button", { name: /^Change the/ })).toHaveCount(0)
    // A new link: two roles, no password field.
    const options = card.locator("[data-guest-link-options]")
    await press(options.getByRole("button", { name: "Permission: Can view" }))
    await expect(page.getByRole("menuitem")).toHaveCount(2)
    await press(page.getByRole("menuitem", { name: /^Can comment/ }))
    await expect(options.getByRole("button", { name: "Add a password" })).toHaveCount(0)
    const create = options.getByRole("button", { name: "Create link" })
    await expect(create).toBeInViewport()
    await press(create)
    await expect.poll(() => made.at(-1)).toMatchObject({ resource_type: "doc", resource_id: DOC, capability: "comment" })
    expect(Object.keys(made.at(-1)!)).not.toContain("password")
    await expect(card.getByLabel("Guest link")).toBeVisible()
    if (screen.hasTouch) {
      // The design look's frame of the doc's card on a phone, once its finite animations are done.
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity), undefined, { timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(300)
      await page.screenshot({ path: process.env.SHOTS_DIR ? `${process.env.SHOTS_DIR}/docs-link-card-390-dark.png` : testInfo.outputPath("docs-link-card-390-dark.png") })
    }
    await tab.close()
  })
}
