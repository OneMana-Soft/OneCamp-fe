import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, blockIds, openDocAs } from "./twoPeople"

// Two people in one doc, each in a browser of their own (the docs programme's
// two-client harness, A1): what one writes reaches the other, every block has
// an id of its own in both, and each sees the other's caret, hidden from a
// screen reader. The collaboration socket is answered in this process
// (collabRelay.ts); nothing reaches a real server.

const DOC = "5b8e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"

test.describe.configure({ mode: "serial" })

test("what one person types reaches the other, both ways", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  // No apostrophes: the editor makes them typographic (T29). The other tab's
  // body also holds the writer's caret label, so it is read by containment.
  await sam.page.keyboard.type("Sam writes the first line")
  await expect(priya.body).toContainText("Sam writes the first line", { timeout: 15_000 })

  await priya.body.click()
  await priya.page.keyboard.press("Control+End")
  await priya.page.keyboard.press("Enter")
  await priya.page.keyboard.type("Priya answers on the second")
  await expect(sam.body).toContainText("Priya answers on the second", { timeout: 15_000 })
  await expect(sam.body.locator("p")).toHaveCount(2)
  await expect(priya.body.locator("p")).toHaveCount(2)

  await sam.close()
  await priya.close()
})

test("every block gets an id of its own, and both tabs agree on them", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  for (const line of ["one", "two", "three"]) {
    await sam.page.keyboard.type(line)
    await sam.page.keyboard.press("Enter")
  }
  await expect(priya.body).toContainText("three", { timeout: 15_000 })
  await priya.body.click()
  await priya.page.keyboard.press("Control+Home")
  // Enter at a block's start: the text keeps its id, the new line gets one.
  await priya.page.keyboard.press("Enter")
  await priya.page.keyboard.type("zero")

  await expect.poll(async () => (await blockIds(sam)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(5)
  await expect.poll(async () => JSON.stringify(await blockIds(priya)), { timeout: 15_000 }).toBe(JSON.stringify(await blockIds(sam)))
  const ids = await blockIds(sam)
  expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true)
  expect(new Set(ids).size).toBe(ids.length)

  await sam.close()
  await priya.close()
})

test("each sees the other's caret in their colour, hidden from a screen reader", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  await sam.page.keyboard.type("Where Sam is")
  const caret = priya.body.locator(".collaboration-cursor__caret").filter({ hasText: "Sam" })
  await expect(caret).toHaveCount(1, { timeout: 15_000 })
  await expect(caret).toHaveAttribute("aria-hidden", "true")
  await expect(caret).toHaveAttribute("data-user-id", SAM.user_uuid)

  await sam.close()
  await priya.close()
})
