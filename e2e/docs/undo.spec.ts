import { expect, test, type Locator } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs } from "./twoPeople"

// ⌘Z in a live doc, in two browsers (two-client harness, A1): a change that
// adds blocks is one undo step, block ids and all. It wasn't: the ids were
// written to the shared doc out of history, and took the change with them, so
// ⌘Z after Enter or a paste undid the typing before it instead. Undo is each
// person's own: the other person's ⌘Z never takes back what this one did.

const DOC = "7c2d9e4f-1a3b-4c5d-8e6f-9a0b1c2d3e4f"

/** Yjs puts changes less than 500 ms apart in one step: a pause makes the next change a step of its own. */
const PAUSE_MS = 700

/** The doc's lines (paragraphs, all these flows make) as one person's editor shows them. */
const lines = (body: Locator) => body.locator("p")

/** A line's own text: without the other person's caret, whose name label is drawn inside it. */
const textOf = (line: Locator) =>
  line.evaluate((p) => {
    const copy = p.cloneNode(true) as HTMLElement
    copy.querySelectorAll(".collaboration-cursor__caret").forEach((caret) => caret.remove())
    return copy.textContent
  })

test.describe.configure({ mode: "serial" })

test("⌘Z takes back Enter and only Enter, for the other person too; ⌘⇧Z puts it back", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocAs(browser, testInfo, relay, PRIYA, { id: DOC })

  await sam.body.click()
  await sam.page.keyboard.type("Ship on Thursday")
  await sam.page.waitForTimeout(PAUSE_MS)
  await sam.page.keyboard.press("Enter")
  await expect(lines(sam.body)).toHaveCount(2)
  await expect(lines(priya.body)).toHaveCount(2, { timeout: 15_000 })

  await sam.page.keyboard.press("ControlOrMeta+z")
  await expect(lines(sam.body)).toHaveCount(1)
  await expect.poll(() => textOf(lines(sam.body).first())).toBe("Ship on Thursday")
  await expect(lines(priya.body)).toHaveCount(1, { timeout: 15_000 })
  await expect(priya.body).toContainText("Ship on Thursday")

  // Priya's ⌘Z has nothing of Sam's to take back.
  await priya.body.click()
  await priya.page.keyboard.press("ControlOrMeta+z")
  await priya.page.waitForTimeout(PAUSE_MS)
  await expect(lines(priya.body)).toHaveCount(1)
  await expect(priya.body).toContainText("Ship on Thursday")

  await sam.body.click()
  await sam.page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(lines(sam.body)).toHaveCount(2)
  await expect(lines(priya.body)).toHaveCount(2, { timeout: 15_000 })
  await expect.poll(() => textOf(lines(sam.body).first())).toBe("Ship on Thursday")

  await sam.close()
  await priya.close()
})

test("⌘Z takes back a paste of two blocks at once", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC })

  await sam.body.click()
  await sam.page.keyboard.type("Agenda")
  await sam.page.waitForTimeout(PAUSE_MS)
  // The clipboard as a copy from another app leaves it: two paragraphs.
  await sam.body.evaluate((el) => {
    const data = new DataTransfer()
    data.setData("text/html", "<p>Budget</p><p>Hiring</p>")
    data.setData("text/plain", "Budget\n\nHiring")
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(sam.body).toContainText("Hiring")
  await expect(lines(sam.body)).toHaveCount(2)

  await sam.page.keyboard.press("ControlOrMeta+z")
  await expect(lines(sam.body)).toHaveCount(1)
  await expect.poll(() => textOf(lines(sam.body).first())).toBe("Agenda")

  await sam.page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(lines(sam.body)).toHaveCount(2)
  await expect(sam.body).toContainText("Hiring")

  await sam.close()
})
