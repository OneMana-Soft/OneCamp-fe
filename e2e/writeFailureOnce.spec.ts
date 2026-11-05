import { expect, test, type Request } from "@playwright/test"

import { SAM, stubBackend, withStatus } from "./stubbedApp"
import { SCHEMES, SCREENS, press, screenUse } from "./screens"
import { expectNoToast, toastRegion as toasts } from "./toasts"

/**
 * A failed save is said once (V-397, lib/http/writeFailure): a switch row that says it in place ("Not saved. <why>",
 * components/ui/saveStatus) says it there only, and no toast says it again over the next row. At 390 the second
 * report, a toast, lay over the row below the switch. Admin › Apps' switch, refused (409) and unanswered (no network),
 * on a computer and on a phone by touch, light and dark. So is a failure a dialog says in its own words (saidHere,
 * lib/http/saidHere: the edit sheet's Test), and one its caller toasts itself (Remove: its own toast stands for the
 * shared one, which said "Already changed" over it).
 */
const ADMIN = { ...SAM, user_is_admin: true }
const APP = "3c1d2e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
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
/** The server's words for a switch another admin changed first (409). */
const REFUSED = "Someone else changed this app a moment ago. Check it, then try again."
/** The server's words for a test the app didn't answer. */
const UNANSWERED_TEST = "Deploys didn't answer at its command address."
/** The shared toast's title for a write with no answer (lib/axiosInstance's NO_ANSWER_TO_A_WRITE). */
const UNREACHED_TOAST = "Couldn't reach the server"

/** Admin › Apps with one app on; each try to turn it off is answered by the next of `answers` (0: no answer). */
function server(answers: number[]) {
  const writes: unknown[] = []
  const apps = (url: URL, request: Request) => {
    if (request.method() === "POST" && url.pathname.endsWith(`/apps/${APP}/enabled`)) {
      writes.push(request.postDataJSON())
      const status = answers.shift() ?? 200
      if (status === 0) return withStatus(0, null)
      if (status !== 200) return withStatus(status, { msg: REFUSED })
      return { msg: "ok" }
    }
    return { data: { apps: [ROW] } }
  }
  return { apps, writes }
}

/** Admin › Apps whose app's test and removal are refused, in the server's words. */
function refusing() {
  const writes: string[] = []
  const apps = (url: URL, request: Request) => {
    if (request.method() === "POST" && url.pathname.endsWith(`/apps/${APP}/test`)) {
      writes.push("test")
      return withStatus(400, { msg: UNANSWERED_TEST })
    }
    if (request.method() === "DELETE" && url.pathname.endsWith(`/apps/${APP}`)) {
      writes.push("remove")
      return withStatus(409, { msg: REFUSED })
    }
    return { data: { apps: [ROW] } }
  }
  return { apps, writes }
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("a switch whose save fails says so on its row, once: no toast says it again", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const backend = server([409, 0])
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/admin/apps": backend.apps,
          "/admin/marketplace": { data: { apps: [] } },
        })
        await page.goto("/app/admin?tab=apps", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const toggle = page.getByRole("switch", { name: "Use Deploys" })
        await expect(toggle).toBeVisible({ timeout: 60_000 })
        await expect(toggle).toBeChecked()
        await toggle.scrollIntoViewIfNeeded()
        // The row's own live region, beside its switch (SavedTick).
        const said = toggle.locator("xpath=..").getByRole("status")

        // Refused: the server's words on the row, the switch back on, and no toast over what comes next.
        await press(screen, toggle)
        await expect.poll(() => backend.writes.length).toBe(1)
        await expect(said).toHaveText(`Not saved. ${REFUSED}`, { timeout: 30_000 })
        await expect(toggle).toBeChecked()
        // The shared toast would come one turn after the failure; give it many more, then count once.
        await expectNoToast(page)

        // No answer: the row says it wasn't saved, and still no toast says it again.
        await press(screen, toggle)
        await expect.poll(() => backend.writes.length).toBe(2)
        await expect(said).toHaveText(/^Not saved\. \S/, { timeout: 30_000 })
        await expect(said).not.toHaveText(`Not saved. ${REFUSED}`)
        await expect(toggle).toBeChecked()
        await expectNoToast(page, UNREACHED_TOAST)
        await expectNoToast(page, undefined, 0)
        expect(backend.writes).toEqual([{ enabled: false }, { enabled: false }])
      })

      test("a dialog that says a failure in its words, and a remove that toasts its own, say it once", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const backend = refusing()
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/admin/apps": backend.apps,
          "/admin/marketplace": { data: { apps: [] } },
        })
        await page.goto("/app/admin?tab=apps", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const edit = page.getByRole("button", { name: "Edit Deploys" })
        await expect(edit).toBeVisible({ timeout: 60_000 })

        // The edit sheet's Test: the sheet says why, and no toast says it again over its Save.
        await press(screen, edit)
        const sheet = page.getByRole("dialog")
        await press(screen, sheet.getByRole("button", { name: "Test", exact: true }))
        await expect.poll(() => backend.writes).toEqual(["test"])
        await expect(sheet.getByRole("status").filter({ hasText: "The test didn't reach the app." })).toContainText(UNANSWERED_TEST, { timeout: 30_000 })
        await expectNoToast(page)
        await press(screen, sheet.getByRole("button", { name: "Cancel" }))
        await expect(sheet).toHaveCount(0)

        // Remove: one toast, the card's own, with the server's words; the shared one doesn't stack on it.
        await press(screen, page.getByRole("button", { name: "Remove Deploys" }))
        await press(screen, page.getByRole("dialog").getByRole("button", { name: "Remove app" }))
        await expect.poll(() => backend.writes).toEqual(["test", "remove"])
        await expect(toasts(page).getByText("Couldn't remove Deploys")).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1_500)
        expect(await toasts(page).getByRole("listitem").count()).toBe(1)
        await expect(toasts(page).getByRole("listitem")).toContainText(REFUSED)
      })
    })
  }
}
