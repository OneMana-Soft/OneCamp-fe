import { expect, test, type Page } from "@playwright/test"
import { holdChunk } from "./holdChunk"
import { stubBackend } from "./stubbedApp"

// V-266: the desktop sidebar's Docs section holds its height while its tree's chunk (DocsTreeGroups) comes, so
// nothing below it moves when the tree lands. It drew three skeleton rows, then an empty tree's one row, and every
// section below jumped up on every /app page of a workspace with no docs.
const NOW = new Date("2026-10-29T10:00:00Z")
const DOCS_TREE_MARK = "data-docs-tree-groups"
const ANSWERS = { "/project/overview": { msg: "ok", data: { projects: [] } }, "/notices": { msg: "ok", data: [] } }

test.use({ viewport: { width: 1280, height: 900 } })

/** The Docs section's height and the top of what follows it in the sidebar, in px. */
async function docsBoxes(page: Page) {
  return page.locator('[data-section="Docs"]').evaluate((el) => {
    const next = el.nextElementSibling ?? el.parentElement?.nextElementSibling
    return { height: el.getBoundingClientRect().height, below: next ? next.getBoundingClientRect().top : null }
  })
}

test("the sidebar's Docs section keeps its height while its tree comes, so nothing below it moves", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const tree = await holdChunk(page, DOCS_TREE_MARK)
  await stubBackend(page, testInfo, ANSWERS)
  await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const docs = page.locator('[data-section="Docs"]')
  await expect(docs.locator("[data-doc-tree-skeleton]")).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => tree.asked(), { timeout: 30_000 }).toBe(true)
  const held = await docsBoxes(page)

  tree.release()
  // An empty tree lands as its one invitation row.
  await expect(docs.getByRole("button", { name: "Write the first doc" })).toBeVisible({ timeout: 30_000 })
  await expect(docs.locator("[data-doc-tree-skeleton]")).toHaveCount(0)
  const landed = await docsBoxes(page)
  expect(Math.abs(landed.height - held.height), `the Docs section went from ${held.height} px to ${landed.height} px`).toBeLessThan(0.5)
  if (held.below !== null && landed.below !== null) {
    expect(Math.abs(landed.below - held.below), `what follows Docs moved from ${held.below} to ${landed.below}`).toBeLessThan(0.5)
  }
  // The room the tree took is kept on this device...
  const took = await docs.getByRole("button", { name: "Write the first doc" }).evaluate((el) => String((el as HTMLElement).offsetHeight))
  expect(await page.evaluate(() => localStorage.getItem("oc_docs_tree_h"))).toBe(took)
  await tree.done()

  // ...and the next load's stand-in takes the room kept, here as a tree with docs left it. (done() drops every route,
  // the backend's too, so it is answered again: only the held chunk keeps the stand-in up.)
  const again = await holdChunk(page, DOCS_TREE_MARK)
  await stubBackend(page, testInfo, ANSWERS)
  await page.evaluate(() => localStorage.setItem("oc_docs_tree_h", "150"))
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 })
  const standIn = docs.locator("[data-doc-tree-skeleton]")
  await expect(standIn).toBeVisible({ timeout: 60_000 })
  // The app's boot script gave it the room on <html>, from the page's own markup, before the app's code ran.
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--docs-tree-h"))).toBe("150px")
  expect(await standIn.evaluate((el) => el.getBoundingClientRect().height)).toBe(150)
  await expect.poll(() => again.asked(), { timeout: 30_000 }).toBe(true)

  // The tree lands, and the room kept follows it (here back to the empty tree's one row).
  again.release()
  await expect(docs.getByRole("button", { name: "Write the first doc" })).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => localStorage.getItem("oc_docs_tree_h"))).toBe(took)
  await again.done()
})
