import { expect, test, type Locator } from "@playwright/test"
import * as Y from "yjs"

import { SAM, reviewShot } from "../stubbedApp"
import { docFromBlocks } from "../../scripts/fluidity/fakeCollab.mjs"
import { CollabRelay } from "./collabRelay"
import { phoneOption } from "./docWith"
import { openDocAs } from "./twoPeople"

// A DOC'S FIND BAR WITH REPLACE OPEN (miro-05; components/docEditor/FindBar).
// Find's small square buttons are one shared button (components/ui/findIconButton),
// worn by a board's Find and a doc's alike, and on a phone they grow from 28 to
// 36 px. The doc's bar still has to fit them: each row on one line, both fields
// with room to type, no button clipped or covered, and Replace all still writes
// the new words for everyone.

const DOC = "f1d0ba70-0000-4000-8000-000000000001"
const LINE = "We launch the launch plan on Thursday."
const KEPT = { oc_keys_tip_seen: "1", "onecamp:demo-lead-dismissed": "1", "ui-theme": "light" }
// A field's least room to type: 6 em at a phone's 16 px.
const ROOM = 96

test.describe.configure({ timeout: 180_000 })

function seeded(): CollabRelay {
  const relay = new CollabRelay()
  Y.applyUpdate(relay.doc(DOC), docFromBlocks([{ type: "paragraph", text: LINE }]).update)
  return relay
}

const serverText = (relay: CollabRelay) => relay.doc(DOC).getXmlFragment("default").toString()

/** The bar as drawn: its rows (how far apart their parts' middles sit, any overflow), its fields' widths, and each button's size and whether it is the top layer at its middle. */
function layoutOf(bar: Locator) {
  return bar.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const rows = Array.from(el.children).filter((c) => c.tagName === "DIV")
    return {
      bar: { left: box.left, right: box.right, overflow: el.scrollWidth - el.clientWidth },
      viewport: window.innerWidth,
      rows: rows.map((row) => {
        const parts = Array.from(row.children).map((c) => c.getBoundingClientRect())
        const middles = parts.map((r) => r.top + r.height / 2)
        return {
          spread: Math.max(...middles) - Math.min(...middles),
          overflow: row.scrollWidth - row.clientWidth,
          left: Math.min(...parts.map((r) => r.left)),
          right: Math.max(...parts.map((r) => r.right)),
        }
      }),
      fields: Array.from(el.querySelectorAll("input")).map((input) => ({ name: input.getAttribute("aria-label"), width: input.clientWidth })),
      buttons: Array.from(el.querySelectorAll("button")).map((button) => {
        const r = button.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return { name: button.getAttribute("aria-label"), width: Math.round(r.width), height: Math.round(r.height), onTop: !!top && button.contains(top) }
      }),
    }
  })
}

const SCREENS = [
  { name: "On a phone", phone: true, size: 36 },
  { name: "On a computer", phone: false, size: 28 },
] as const

for (const screen of SCREENS) {
  test(`${screen.name}, a doc's Find with Replace open keeps each row on one line, room to type and ${screen.size} px buttons, and Replace all writes for everyone`, async ({ browser }, testInfo) => {
    const relay = seeded()
    const tab = await openDocAs(browser, testInfo, relay, SAM, { id: DOC }, { phone: screen.phone, storage: KEPT })
    const { page, body } = tab
    await expect(body).toContainText(LINE, { timeout: 15_000 })
    if (screen.phone) await phoneOption(page, "Find in doc")
    else {
      await body.click()
      await page.keyboard.press("Control+f")
    }
    const bar = page.getByRole("search", { name: "Find in doc" })
    await bar.getByRole("textbox", { name: "Find" }).fill("launch")
    await expect(bar).toContainText("1 of 2")
    const toggle = bar.getByRole("button", { name: "Show replace" })
    await (screen.phone ? toggle.tap() : toggle.click())
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    await bar.getByRole("textbox", { name: "Replace with" }).fill("ship")

    // Every button enabled (a disabled one takes no pointer, so it can't be the top layer).
    const seen = await layoutOf(bar)
    console.log(`[findBar] ${page.viewportSize()?.width}: ${JSON.stringify(seen)}`)
    expect(seen.rows).toHaveLength(2)
    for (const row of seen.rows) {
      expect(row.spread, "a row's parts on one line").toBeLessThanOrEqual(1)
      expect(row.overflow, "a row clipped").toBeLessThanOrEqual(0)
      expect(row.left).toBeGreaterThanOrEqual(seen.bar.left - 0.5)
      expect(row.right).toBeLessThanOrEqual(seen.bar.right + 0.5)
    }
    expect(seen.bar.overflow, "the bar clipped").toBeLessThanOrEqual(0)
    expect(seen.bar.left).toBeGreaterThanOrEqual(0)
    expect(seen.bar.right).toBeLessThanOrEqual(seen.viewport)
    expect(seen.fields.map((f) => f.name)).toEqual(["Find", "Replace with"])
    for (const field of seen.fields) expect(field.width, `${field.name}'s room to type`).toBeGreaterThanOrEqual(ROOM)
    expect(seen.buttons).toHaveLength(8)
    expect(seen.buttons).toEqual(seen.buttons.map((b) => ({ ...b, width: screen.size, height: screen.size, onTop: true })))
    await reviewShot(page, "doc-find-replace", "light")

    const all = bar.getByRole("button", { name: "Replace all" })
    await (screen.phone ? all.tap() : all.click())
    await expect(body).toContainText("We ship the ship plan on Thursday.")
    await expect.poll(() => serverText(relay), { timeout: 15_000 }).toContain("We ship the ship plan on Thursday.")
    await tab.close()
  })
}
