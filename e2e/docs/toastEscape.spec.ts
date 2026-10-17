import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// Esc closes the innermost layer first (interaction spec, rule 7), and a
// toast is not one. Radix made every toast a layer, so a toast that came up
// in a dialog (Saved a version, Link copied) was the top layer: Esc closed
// the toast and left the dialog open. Now a toast takes Esc only when it has
// focus, or when nothing else is open (components/ui/toastEscape.test.tsx has
// the rest of the rule).

const DOC = "7e1d2c3b-4a5f-4e6d-8c7b-9a0f1e2d3c4b"
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const V1 = { id: "v1", kind: "doc", pinned: false, reason: "interval", created_at: ago(30), contributors: [{ user_uuid: SAM.user_uuid }] }
const KEPT = { id: "v2", kind: "doc", pinned: true, name: "Before the review", reason: "saved", created_at: ago(0), contributors: [{ user_uuid: SAM.user_uuid }] }
const people = { [SAM.user_uuid]: { name: "Sam Rivera" } }

test("Esc closes the dialog a toast came up in, then the toast; a toast with focus closes on Esc", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC }, {
    "/doc/versions/v1": { msg: "Success", data: { html: "<p>We ship on Friday</p>" } },
    "/doc/versions/v2": { msg: "Success", data: { html: "<p>We ship on Friday</p>" } },
    "/doc/versions": { msg: "Success", data: { versions: [V1], people } },
  })
  const page = tab.page
  // Saving a version answers with the version kept; the answer above is the list's.
  await page.route(/\/doc\/versions$/, (route) => {
    const request = route.request()
    if (request.method() !== "POST") return route.fallback()
    const headers = { "access-control-allow-origin": request.headers()["origin"] || "*", "access-control-allow-credentials": "true" }
    return route.fulfill({ status: 200, headers, json: { msg: "Success", data: KEPT } })
  })

  await page.getByRole("button", { name: "More doc actions" }).click()
  await page.getByRole("menuitem", { name: "Version history" }).click()
  const sheet = page.locator("[data-history-sheet]")
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await sheet.locator("[data-save-version]").click()
  await page.getByLabel("Keep the doc as it is now").fill("Before the review")

  // The page's clock stops before the toast comes, so nothing but Esc closes
  // it: not its own 4 seconds, however long the steps below take.
  await page.clock.install()
  await page.clock.pauseAt(Date.now() + 200)
  await page.keyboard.press("Enter")
  const toast = page.locator(".toast-root", { hasText: 'Saved "Before the review"' })
  await expect(toast).toHaveAttribute("data-state", "open")
  // Over the open dialog it still takes a click, as it did when it was a layer.
  await expect(toast).toHaveCSS("pointer-events", "auto")
  // Save version's popover has gone: a layer still playing its way out is
  // still the top one, and takes an Esc first, as it should.
  await expect(page.getByLabel("Keep the doc as it is now")).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(sheet).toHaveCount(0)
  await expect(toast).toHaveAttribute("data-state", "open")

  await toast.focus()
  await page.keyboard.press("Escape")
  await expect(toast).toHaveCount(0)
  await tab.close()
})
