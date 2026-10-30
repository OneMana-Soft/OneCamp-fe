import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM, docInfo } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { more, openDocWith } from "./docs/docWith"

// A TOOLTIP FOLLOWS THE INPUT, NOT THE WIDTH (21 Oct 2026; components/ui/tooltip).
// On a touch screen a label shows on a long press only, never on a tap or on
// the focus a closing menu gives back. The tooltip read the width (isMobile),
// so a phone held sideways, 844px wide, opened its labels as a mouse's: More's
// stood over version history's Save version (DESIGN-BUILD-3, 20 Oct).

const DOC = "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4d"
const SIDEWAYS = { width: 844, height: 390, isMobile: true, hasTouch: true }
const V1 = { id: "v1", kind: "doc", pinned: true, name: "Sent to Acme", reason: "saved", created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), contributors: [{ user_uuid: SAM.user_uuid }] }

function answers() {
  return {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p>We ship on Thursday.</p>", edit: true }),
    "/doc/versions/v1": { msg: "Success", data: { html: "<p>We ship on Friday.</p>" } },
    "/doc/versions": { msg: "Success", data: { versions: [V1], people: { [SAM.user_uuid]: { name: SAM.user_full_name } } } },
  }
}

/** A label the tooltip shows (its chip, not the copy kept for a screen reader). */
const label = (page: Page, text: string) => page.locator("[data-radix-popper-content-wrapper] > [data-state$='open']").filter({ hasText: text })

/** Past the tooltips' 400 ms: a label that was going to open has. */
const settle = (page: Page) => page.waitForTimeout(800)

/** A finger held on `el` while `during` runs, then lifted, as a phone sends it. */
async function hold(page: Page, el: Locator, during: () => Promise<void>) {
  const box = (await el.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), id: 1, radiusX: 4, radiusY: 4, force: 1 }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] })
  await during()
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

test("a phone held sideways: More shows no label on a tap or over version history, and a long press shows one", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const relay = new CollabRelay()
  const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC, title: "Launch plan", body: "<p>We ship on Thursday.</p>" }, answers(), SIDEWAYS)
  const { page } = tab
  const moreLabel = label(page, "More")

  // A tap opens More's menu, and no label with it, nor when the menu gives the focus back.
  await page.getByRole("button", { name: "More doc actions" }).tap({ timeout: 60_000 })
  await expect(page.locator("[data-doc-more-menu]")).toBeVisible({ timeout: 30_000 })
  await settle(page)
  await expect.soft(moreLabel, "a tap").toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-doc-more-menu]")).toBeHidden()
  await settle(page)
  await expect.soft(moreLabel, "the focus the menu gives back").toHaveCount(0)

  // Version history from More, as DESIGN-BUILD-3's run opened it: Save version
  // in the sheet's header, under where More's label stood, and no label.
  await more(page, "Version history")
  const history = page.locator("[data-history-sheet]")
  await expect(history.getByRole("button", { name: "Save version" })).toBeVisible({ timeout: 60_000 })
  await settle(page)
  await expect.soft(moreLabel, "More's label over Save version").toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(history).toBeHidden()

  // A long press shows a label, so a finger can read it, and it stays once
  // lifted. On Comments, a plain button: More's menu opens as a finger lands.
  const commentsLabel = label(page, "Comments")
  await hold(page, page.getByRole("button", { name: /^Comments, / }), async () => {
    await expect(commentsLabel, "a long press").toBeVisible({ timeout: 5_000 })
  })
  await expect(commentsLabel, "lifted").toBeVisible()
  await tab.close()
})
