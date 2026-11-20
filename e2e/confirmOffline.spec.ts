import { expect, test } from "@playwright/test"

import { holdChunk } from "./holdChunk"
import { openFiles } from "./projectFiles"
import { SCREENS, press, screenUse } from "./screens"
import { SHOT_THEMES, expectEveryCallAnswered, reviewShot } from "./stubbedApp"

// V-978: the app's own confirm (ui.confirmAlert, drawn by UnifiedUIManager for
// every page) is a chunk of its own, which the page asks for once it is idle.
// Raw next/dynamic drew nothing on the first press until the code came, and a
// failed fetch went to the page's error boundary. Here the line drops before
// the page opens, so the idle ask is refused (and says nothing); a project
// file's Delete then says the confirmation couldn't open, the files stay, and
// once the line is back the next Delete asks. The confirm's chunk is the one
// carrying its type-to-confirm mark.

const FILE = "Launch brief.pdf"

for (const scheme of SHOT_THEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("with the confirm's code refused, Delete says it couldn't open and the files stay; back up, it asks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const code = await holdChunk(page, "data-require-match")
        code.fail()
        await openFiles(page, testInfo)
        if (!screen.hasTouch) await page.getByRole("radio", { name: "List" }).click()
        const row = page.locator("[data-file-row]").filter({ hasText: FILE })
        await expect(row).toBeVisible({ timeout: 90_000 })
        // The page asked for the confirm's code when it was idle, before any press.
        await expect.poll(code.asked, { timeout: 30_000 }).toBe(true)

        const askToDelete = async () => {
          if (!screen.hasTouch) await row.hover()
          await press(screen, row.getByRole("button", { name: "Attachment options" }))
          await press(screen, page.getByRole("menuitem", { name: "Delete" }))
        }
        await askToDelete()
        const said = page.locator(".toast-card").filter({ hasText: "Couldn't open the confirmation" })
        await expect(said).toBeVisible()
        await expect(said).toContainText("Check your connection, then try again.")
        await expect(page.getByRole("alertdialog")).toHaveCount(0)
        await expect(page.getByText("Something went wrong")).toHaveCount(0)
        await expect(row).toBeVisible()
        await reviewShot(page, "confirm-offline", scheme)

        code.release()
        await askToDelete()
        const ask = page.getByRole("alertdialog")
        await expect(ask).toContainText(`Delete the file “${FILE}”?`)
        // The failure toast went as the code came (DB-151 F1). Sooner than its own 6 s, so it can't just have timed out.
        await expect(said).toHaveCount(0, { timeout: 2_000 })
        await reviewShot(page, "confirm-back-online", scheme)
        await press(screen, ask.getByRole("button", { name: "Cancel" }))
        await expect(ask).toBeHidden()
        await expect(row).toBeVisible()
        await expectEveryCallAnswered(page)
        await code.done()
      })
    })
  }
}
