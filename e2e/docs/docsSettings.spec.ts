import { expect, test, type Request } from "@playwright/test"

import { SAM, stubBackend } from "../stubbedApp"
import { sheetLayout, topSheet } from "../sheetLayout"
import { SCHEMES, SCREENS, press, screenUse } from "../screens"

/**
 * Settings > Docs (docs C6-2): shortening the longest a link lasts says how
 * many links stop now before it saves, and someone who left is handed on to
 * a person picked in the workspace. On a computer and on a phone by touch,
 * where the hand-on dialog is a sheet, light and dark.
 */
const ADMIN = { ...SAM, user_is_admin: true }
const DANA = "11111111-1111-4111-8111-111111111111"
const MAYA = "22222222-2222-4222-8222-222222222222"
const policy = (key: string, kind: string, value: unknown) => ({ key, kind, label: key, help: "", value, default: value, is_set: false })

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("shortening link lifetimes says how many links stop, then saves; someone who left is handed on", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const phone = screen.hasTouch
        const saved: unknown[] = []
        const handedOn: unknown[] = []
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/admin/policies/guest.link.max_days": () => {
            saved.push(30)
            return { data: policy("guest.link.max_days", "int", 30) }
          },
          "/admin/policies": { data: [policy("docs.export.members", "bool", true), policy("guest.link.max_days", "int", 0), policy("embed.allowlist", "list", null)] },
          "/admin/guest-links/stopped": { data: { days: 30, links: 12 } },
          [`/admin/departed/${DANA}/handover`]: (_url: URL, request: Request) => {
            handedOn.push(request.postDataJSON())
            return { data: { docs: 12, links: 3, failed: 0 } }
          },
          "/admin/departed": { data: { people: [{ user_uuid: DANA, name: "Dana Ross", left_at: "2026-10-01T09:00:00Z", docs: 12, links: 3 }] } },
          // Enough names that a clipped or covered list shows.
          "/user/searchUserAndChannelList": {
            msg: "ok",
            data: [
              { user_uuid: MAYA, user_name: "Maya Chen", user_full_name: "Maya Chen" },
              ...["Maya Brooks", "Mayank Rao", "Maya Ortiz", "Maya Lund", "Mayer Stein"].map((name, n) => ({ user_uuid: `4444444${n}-4444-4444-8444-444444444444`, user_name: name, user_full_name: name })),
            ],
          },
        })
        await page.goto("/app/admin?tab=docs", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByText("Longest a link lasts")).toBeVisible({ timeout: 60_000 })
        await expect(page.locator(`[data-departed="${DANA}"]`)).toContainText("12 docs and 3 links")

        await press(screen, page.getByRole("radio", { name: "30 days" }))
        const ask = page.getByRole("alertdialog", { name: "Shorten links to 30 days?" })
        await expect(ask.getByText(/^12 links older than 30 days stop working now\./)).toBeVisible({ timeout: 30_000 })
        expect(saved).toEqual([])
        await press(screen, ask.getByRole("button", { name: "Shorten links" }))
        await expect.poll(() => saved.length).toBe(1)

        await press(screen, page.locator(`[data-departed="${DANA}"]`).getByRole("button", { name: "Hand on…" }))
        const dialog = phone ? topSheet(page) : page.getByRole("dialog", { name: "Hand on Dana Ross's work" })
        await expect(dialog.getByText("Hand on Dana Ross's work")).toBeVisible({ timeout: 30_000 })
        if (phone) expect(await sheetLayout(dialog)).toMatchObject({ sideways: [], nested: [], clipped: [], squashed: [] })
        const handOn = dialog.getByRole("button", { name: "Hand on", exact: true })
        await expect(handOn).toBeDisabled()
        await dialog.getByRole("combobox").fill("Maya")
        await expect(page.getByRole("option")).toHaveCount(6)
        // Every name offered shows in full: none clipped by the dialog's body or under its pinned footer.
        const hidden = await page.getByRole("listbox").evaluate((list) =>
          Array.from(list.querySelectorAll('[role="option"]'))
            .filter((o) => {
              const r = o.getBoundingClientRect()
              return [r.top + 2, r.bottom - 2].some((y) => {
                const hit = document.elementFromPoint(r.left + r.width / 2, y)
                return !hit || !o.contains(hit)
              })
            })
            .map((o) => o.textContent),
        )
        expect(hidden).toEqual([])
        await press(screen, page.getByRole("option", { name: /Maya Chen/ }))
        await press(screen, handOn)
        await expect.poll(() => handedOn).toEqual([{ to_user_uuid: MAYA }])
        await expect(page.locator(".toast-root", { hasText: "Handed on to Maya Chen" })).toBeVisible()
      })
    })
  }
}
