import { expect, test, type Request } from "@playwright/test"

import { SAM, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { SCHEMES, SCREENS, press, screenUse } from "./screens"

/**
 * Settings > Archive > Restore items (V-141): a restore naming something that
 * has left the archive since the list loaded (someone else restored it) is
 * refused whole, 404 not_in_archive. The dialog says nothing was restored,
 * loads the list as it is now with nothing chosen, and the next restore names
 * only what is still there. On a computer and on a phone by touch, light and
 * dark.
 */
const ADMIN = { ...SAM, user_is_admin: true }
const item = (n: number, name: string) => ({ id: `a1b2c3d4-0000-4000-8000-00000000000${n}`, name, archived_at: "2026-10-05T02:01:00Z" })
const KICKOFF = item(1, "Kickoff notes for the Northwind rebrand")
const RETRO = item(2, "Q3 retro: what we'd change")
const REFUSED = "Some of these aren't in the archive any more, so nothing was restored. Choose again from the list as it is now."

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("a restore naming something that has left the archive says so, and the list starts over", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        // Someone else restores the kickoff notes while this list is open.
        let gone = false
        const asked: unknown[] = []
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/admin/archive/policies": { policies: [] },
          "/admin/archive/jobs": { jobs: [] },
          "/admin/archive/stats": { stats: { total_archived_posts: 2 } },
          "/admin/archive/recent-items/": () => (gone ? { items: [RETRO], total: 1 } : { items: [KICKOFF, RETRO], total: 2 }),
          "/admin/archive/restore": (_url: URL, request: Request) => {
            asked.push(request.postDataJSON())
            if (asked.length > 1) return { msg: "Items restored", count: 1 }
            gone = true
            return withStatus(404, { code: "not_in_archive", msg: `not in the archive: ${KICKOFF.id}` })
          },
        })
        await page.goto("/app/admin?tab=archive", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await press(screen, page.getByRole("button", { name: "Restore items" }))
        const dialog = page.getByRole("dialog", { name: "Restore archived items" })
        await press(screen, dialog.getByRole("checkbox", { name: KICKOFF.name }))
        await press(screen, dialog.getByRole("checkbox", { name: RETRO.name }))
        await press(screen, dialog.getByRole("button", { name: "Restore 2 items" }))

        // Refused whole: it says so, in the dialog, which stays open on the list as it is now, nothing chosen.
        await expect(dialog.getByRole("alert")).toHaveText(REFUSED, { timeout: 30_000 })
        await expect(dialog.getByRole("checkbox", { name: KICKOFF.name })).toHaveCount(0)
        await expect(dialog.getByRole("checkbox", { name: RETRO.name })).toHaveAttribute("aria-checked", "false")
        await reviewShot(page, "archive-restore-left", scheme)

        // The next try names only what is still there, and it comes back.
        await press(screen, dialog.getByRole("checkbox", { name: RETRO.name }))
        await press(screen, dialog.getByRole("button", { name: "Restore 1 item" }))
        await expect(dialog).toBeHidden({ timeout: 30_000 })
        expect(asked).toEqual([
          { entity_type: "posts", entity_ids: [KICKOFF.id, RETRO.id] },
          { entity_type: "posts", entity_ids: [RETRO.id] },
        ])
      })
    })
  }
}
