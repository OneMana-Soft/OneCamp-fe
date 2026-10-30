import { expect, test, type Locator, type Request } from "@playwright/test"

import { importPage } from "./adminImport"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"

// The admin's workspace export holds the boards too (miro-36 item 4): the card
// says so, a made export counts its boards apart from its docs, what it left
// out (private boards, a board it couldn't read, a picture past a board's
// file) is said in words, and Export all starts one, at 1280 and at 390 with
// touch.

const MADE = {
  id: "e7a00000-0000-4000-8000-000000000001",
  kind: "export",
  format: "workspace-md",
  status: "done",
  progress: 100,
  created_at: "2026-10-28T09:00:00Z",
  kept_until: "2099-01-01T00:00:00Z",
  exported: 12,
  exported_boards: 3,
  skipped: [
    { what: "2 private boards", why: "they aren't shared with you" },
    { what: "1 picture on the board ‘Moodboard’", why: "a board's file holds up to 50 MB of pictures" },
    { what: "Retro", why: "the board could not be read" },
  ],
}
const RUNNING = { ...MADE, id: "e7a00000-0000-4000-8000-000000000002", status: "running", progress: 40, created_at: "2026-10-28T10:00:00Z", skipped: [], exported: undefined, exported_boards: undefined, kept_until: undefined }

for (const theme of SHOT_THEMES) {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    test.describe(`The workspace export with its boards at ${viewport.width}, ${theme}`, () => {
      const phone = viewport.width < 640
      test.use({ viewport, colorScheme: theme, ...(phone ? { isMobile: true, hasTouch: true } : {}) })
      const press = (l: Locator) => (phone ? l.tap() : l.click())

      test("says it holds the boards, counts them apart from the docs, says what it left out, and starts one", async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        let started = false
        await importPage(page, testInfo, true, "", {
          "/admin/docs/exports": (_: URL, r: Request) => {
            if (r.method() === "POST") {
              started = true
              return { export: RUNNING }
            }
            return { exports: started ? [RUNNING, MADE] : [MADE] }
          },
        })
        const card = page.getByRole("region", { name: "Export the workspace's docs and boards" })
        await expect(card).toBeVisible({ timeout: 90_000 })
        await expect(card.getByText(/as an Excalidraw file with its pictures, in a Boards folder/)).toBeVisible()
        const made = card.locator('[data-export-job="done"]')
        await expect(made.getByText("Docs and boards")).toBeVisible()
        await expect(made.getByText("12 docs")).toBeVisible()
        await expect(made.getByText("3 boards")).toBeVisible()
        await expect(made.getByText("2 private boards left out: they aren't shared with you.")).toBeVisible()
        await expect(made.getByText("1 picture on the board ‘Moodboard’ left out: a board's file holds up to 50 MB of pictures.")).toBeVisible()
        await expect(made.getByText("Boards that couldn't be read, so not in it: ‘Retro’.")).toBeVisible()
        await reviewShot(page, `workspace-export-boards-${viewport.width}`, theme)

        await press(card.getByRole("button", { name: /^Export all$/ }))
        await expect(card.locator('[data-export-job="running"]')).toBeVisible({ timeout: 10_000 })
        await expect(card.getByRole("button", { name: /^Exporting…$/ })).toBeDisabled()
      })
    })
  }
}
