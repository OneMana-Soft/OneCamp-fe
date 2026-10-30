import { expect, test } from "@playwright/test"

import { holdChunk } from "./holdChunk"
import { stubBackend } from "./stubbedApp"

// Regression audit S-d (23 Oct 2026): ⌘K pressed in the first seconds after
// the app opened did nothing. The palette is a chunk of its own, and its key
// listener came with that chunk, so a press before it arrived was lost, while
// a click on the sidebar's pill was kept (lib/ui/palette). The loader, drawn
// with the shell, now keeps the press as a request that the palette takes as
// it mounts (components/ui/CommandPaletteLoader).

test.use({ viewport: { width: 1280, height: 860 } })

/** A string only the palette's own module carries (components/ui/CommandPalette's empty state: this edition's palette has no search-or-ask switch). */
const PALETTE_CODE = "palette-empty"

test("⌘K pressed before the palette's code has come opens the palette once it comes", async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {})
  const code = await holdChunk(page, PALETTE_CODE)
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('a[href="/app/inbox"]').first()).toBeVisible({ timeout: 60_000 })
  await page.keyboard.press("ControlOrMeta+k")
  // The palette's code is on its way, and held: the press came before it.
  await expect.poll(code.asked, { timeout: 30_000 }).toBe(true)
  const palette = page.getByRole("dialog", { name: "Search, jump, or ask" })
  await expect(palette).toBeHidden()
  code.release()
  await expect(palette).toBeVisible({ timeout: 30_000 })
  await code.done()
})
