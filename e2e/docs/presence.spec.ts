import { expect, test, type Page } from "@playwright/test"
import * as Y from "yjs"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"
import { PRIYA } from "./twoPeople"

// Presence (B8, collaboration.md P1-E, N50): two people who go by one name
// ("sam", the name the app shows: their user name) are two people. A third
// jumps to each, and follows one, by their awareness client: the list never
// matches a caret by its name. Three browsers on the relay; nothing reaches a
// real server.

const DOC = "3e9a1c7b-5d2f-4a8e-b6c4-0f1e2d3c4b5a"

/** The other Sam: the same name the app shows, another person. */
const SAM_TWO = { ...SAM, user_uuid: "9b7c2e4d-1a3f-4c5e-8d6b-7a8f9e0d1c2b", user_email_id: "sam.two@example.com" }

/** The doc the relay holds before anyone opens it: long enough that two places are a screen apart. */
function seed(relay: CollabRelay) {
  const frag = relay.doc(DOC).getXmlFragment("default")
  const paragraphs = Array.from({ length: 70 }, (_, i) => {
    const p = new Y.XmlElement("paragraph")
    p.insert(0, [new Y.XmlText(`Paragraph ${i + 1}: the launch plan says what ships, who owns it and when it goes out to the pilot customers.`)])
    return p
  })
  frag.insert(0, paragraphs)
}

/** Puts the caret at the end of a paragraph and types there. */
async function writeAt(page: Page, n: number, text: string) {
  const p = page.locator(".doc-editor .ProseMirror p").nth(n - 1)
  await p.scrollIntoViewIfNeeded()
  await p.click()
  await page.keyboard.press("End")
  await page.keyboard.type(text)
}

async function openHereNow(page: Page) {
  await page.getByRole("button", { name: /^Here now/ }).click()
  await expect(page.locator("[data-presence-rows]")).toBeVisible()
}

// Up to three browsers each open the doc on the relay, and a busy machine
// takes several seconds per browser: at load ~97 the first test was on its
// last step when the default 30 seconds ran out. Each step keeps its own bound.
test.describe.configure({ mode: "serial", timeout: 120_000 })

test("jumps to each of two people with one name, by who they are, not what they are called", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  seed(relay)
  const samA = await openDocWith(browser, testInfo, relay, SAM, { id: DOC })
  const samB = await openDocWith(browser, testInfo, relay, SAM_TWO, { id: DOC })
  const priya = await openDocWith(browser, testInfo, relay, PRIYA, { id: DOC })

  await writeAt(samA.page, 3, " A was here")
  await writeAt(samB.page, 62, " B was here")
  await expect(priya.body).toContainText("B was here", { timeout: 15_000 })

  await openHereNow(priya.page)
  const rows = priya.page.locator("[data-presence-row]")
  await expect(rows).toHaveCount(3)
  await expect(priya.page.getByRole("button", { name: "Jump to sam" })).toHaveCount(2)

  // The second Sam's row: their caret is near the end.
  await priya.page.locator(`[data-presence-row="${SAM_TWO.user_uuid}"]`).getByRole("button", { name: "Jump to sam" }).click()
  await expect(priya.page.locator(".doc-editor .ProseMirror p").filter({ hasText: "B was here" })).toBeInViewport({ timeout: 10_000 })
  await expect(priya.page.locator(".doc-editor .ProseMirror p").filter({ hasText: "A was here" })).not.toBeInViewport()

  // And the first Sam's: near the top.
  await openHereNow(priya.page)
  await priya.page.locator(`[data-presence-row="${SAM.user_uuid}"]`).getByRole("button", { name: "Jump to sam" }).click()
  await expect(priya.page.locator(".doc-editor .ProseMirror p").filter({ hasText: "A was here" })).toBeInViewport({ timeout: 10_000 })

  await samA.close()
  await samB.close()
  await priya.close()
})

test("follows someone as they move, frames the doc in their name, and stops on Esc", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  seed(relay)
  const sam = await openDocWith(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocWith(browser, testInfo, relay, PRIYA, { id: DOC })

  await writeAt(sam.page, 2, " start")
  await openHereNow(priya.page)
  await priya.page.getByRole("button", { name: "Follow sam" }).click()
  await expect(priya.page.locator("[data-following]")).toContainText("Following sam")

  // Sam goes far down and writes: Priya's screen goes with them.
  await writeAt(sam.page, 66, " Sam is down here now")
  await expect(priya.page.locator(".doc-editor .ProseMirror p").filter({ hasText: "Sam is down here now" })).toBeInViewport({ timeout: 10_000 })

  // Sam scrolls back up without typing: Priya sees what Sam sees.
  await sam.page.locator(".doc-scroll").evaluate((el) => (el.scrollTop = 0))
  await expect(priya.page.locator(".doc-editor .ProseMirror p").first()).toBeInViewport({ timeout: 10_000 })

  await priya.page.keyboard.press("Escape")
  await expect(priya.page.locator("[data-following]")).toHaveCount(0)
  await expect(priya.page.getByRole("status").filter({ hasText: "Stopped following sam" })).toHaveCount(1)

  await sam.close()
  await priya.close()
})

test("says who is editing, and a tab says where it is looking only while someone follows it", async ({ browser }, testInfo) => {
  const relay = new CollabRelay()
  seed(relay)
  const sam = await openDocWith(browser, testInfo, relay, SAM, { id: DOC })
  const priya = await openDocWith(browser, testInfo, relay, PRIYA, { id: DOC })
  await writeAt(sam.page, 1, " hello")
  await expect(priya.body).toContainText("hello", { timeout: 15_000 })
  // The line under the title names who just edited, from live presence.
  await expect(priya.page.locator("[data-doc-meta]")).toContainText("Edited just now by sam")
  await openHereNow(priya.page)
  await expect(priya.page.locator(`[data-presence-row="${SAM.user_uuid}"] [data-presence-state]`)).toHaveText("Editing")
  await priya.page.keyboard.press("Escape")

  // Awareness messages Priya's tab sends (type 1 on the collaboration socket).
  const fromPriya = () => relay.received.filter((m) => m.who === PRIYA.user_full_name && m.type === 1).length
  const scrollPriya = (y: number) => priya.page.locator(".doc-scroll").evaluate((el, top) => (el.scrollTop = top), y)
  // A fresh awareness update (her caret) first: awareness renews a state 15
  // seconds after its last change, and that renewal isn't what is measured.
  await priya.body.click()
  await priya.page.waitForTimeout(600)
  const quiet = fromPriya()
  for (const y of [300, 900, 1500]) {
    await scrollPriya(y)
    await priya.page.waitForTimeout(250)
  }
  // Nobody follows her: scrolling says nothing.
  expect(fromPriya()).toBe(quiet)

  await openHereNow(sam.page)
  await sam.page.getByRole("button", { name: "Follow priya" }).click()
  await expect.poll(fromPriya, { timeout: 10_000 }).toBeGreaterThan(quiet)
  const followed = fromPriya()
  await scrollPriya(0)
  await expect.poll(fromPriya, { timeout: 10_000 }).toBeGreaterThan(followed)
  await expect(sam.page.locator(".doc-editor .ProseMirror p").first()).toBeInViewport({ timeout: 10_000 })

  await sam.close()
  await priya.close()
})
