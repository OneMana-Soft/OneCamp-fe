import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs } from "./twoPeople"

// B2 with two people in one doc, each in a browser of their own (A1's
// harness): a toggle opened or closed in one tab stays as it was in the other
// (open or closed is each reader's own, never the doc's), and a colour or a
// highlight reaches the other tab by its name.

const DOC = "6c9f3a2d-0e4b-4d7f-9a8c-1b2c3d4e5f60"

test.describe.configure({ mode: "serial" })

test("closing a toggle in one tab leaves it as it was in the other", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  await sam.page.keyboard.type(">> Risks")
  await sam.page.keyboard.press("Enter")
  await sam.page.keyboard.type("Hidden detail")

  const samToggle = sam.body.locator('[data-type="collapsible"]')
  const priyaToggle = priya.body.locator('[data-type="collapsible"]')
  const detail = (toggle: typeof samToggle) => toggle.locator(".toggle-content > p").filter({ hasText: "Hidden detail" })
  await expect(detail(priyaToggle)).toHaveCount(1, { timeout: 15_000 })

  // Open for the person who wrote it; closed for a reader who never opened it.
  await expect(detail(samToggle)).toBeVisible()
  await expect(detail(priyaToggle)).toBeHidden()
  await expect(priyaToggle.locator(".toggle-content > p").first()).toHaveText("Risks")

  // Priya opens hers, then Sam closes his: neither moves the other's.
  await priyaToggle.getByRole("button", { name: "Open the toggle" }).click()
  await expect(detail(priyaToggle)).toBeVisible()
  await expect(detail(samToggle)).toBeVisible()
  await samToggle.getByRole("button", { name: "Close the toggle" }).click()
  await expect(detail(samToggle)).toBeHidden()
  await priya.page.waitForTimeout(800)
  await expect(detail(priyaToggle)).toBeVisible()
  await expect(priyaToggle.getByRole("button", { name: "Close the toggle" })).toHaveAttribute("aria-expanded", "true")

  await sam.close()
  await priya.close()
})

test("a block's colour and a highlight reach the other tab by name", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  await sam.page.keyboard.type("/blue")
  // The menu's first pick is blue text, not the background.
  const picked = sam.page.locator('[data-slash-menu] [aria-selected="true"]')
  await expect(picked).toContainText("Blue", { timeout: 15_000 })
  await expect(picked).not.toContainText("background")
  await sam.page.keyboard.press("Enter")
  await sam.page.keyboard.type("A blue line")
  await sam.page.keyboard.press("Enter")
  await sam.page.keyboard.type("Some ==marked== text")

  await expect(priya.body.locator('p[data-block-color="sky"]')).toHaveText("A blue line", { timeout: 15_000 })
  await expect(priya.body.locator('mark[data-color="sun"]')).toHaveText("marked", { timeout: 15_000 })
  // The line after a coloured one starts plain (a colour never carries over Enter).
  await expect(priya.body.locator("p").filter({ hasText: "Some" })).not.toHaveAttribute("data-block-color", /.+/)

  await sam.close()
  await priya.close()
})
