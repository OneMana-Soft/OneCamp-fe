import { expect, test } from "@playwright/test"

import { docInfo, stubBackend } from "../stubbedApp"
import { CollabRelay, networkDies } from "./collabRelay"

// V-64 (S1, data loss): on a fresh doc, everything typed after the network
// went was lost when the device still said it was online (Wi-Fi with no
// internet, a dead cell link). The first tap into the doc asks for code the
// page hadn't fetched yet (the toasts' foot slot comes with the first field
// used); it can't come, and the page's chunk recovery took that for a deploy
// and reloaded: the doc, and every key typed after, were gone (live walk on
// the demo, 29 Oct: logs/verify-1/v64/walkv64e-run.log). A doc that took a
// key online had its code already, so nothing failed later.
//
// A failed chunk now reloads the page only when the server says that code is
// gone. With no network nothing answers, so the doc stays, keeps the line, and
// sends it once the network is back, at 1280 and on a phone.

const FRESH = "6c9f3d2e-8b5a-4f4c-ae7d-2a3b4c5d6e7f"
const LINE = "Typed while the network was gone."

for (const [form, use] of [
  ["computer", { viewport: { width: 1280, height: 900 } }],
  ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`a fresh doc typed into after the network died (${form})`, () => {
    test.use(use)

    test("keeps the line, stays on the doc, and sends it once the network is back", async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      const relay = new CollabRelay()
      await stubBackend(page, testInfo, {
        [`/doc/getDocInfo/${FRESH}`]: docInfo({ doc_uuid: FRESH, doc_title: "Fresh", doc_body: "", edit: true }),
      })
      await relay.attach(page, "Sam")
      await page.goto(`/app/doc/${FRESH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const body = page.getByRole("textbox", { name: "Fresh" })
      await expect(body).toBeVisible({ timeout: 30_000 })
      // Settled online, synced with the relay: the page has what it loads by itself, and nothing more.
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
      await expect.poll(() => relay.received.some((m) => m.doc.includes(FRESH) && m.type === 0), { timeout: 30_000 }).toBe(true)

      let navigations = 0
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) navigations++
      })
      const networkReturns = await networkDies(page, relay)
      expect(await page.evaluate(() => navigator.onLine), "the device still says it is online").toBe(true)

      // Into the first line (the empty doc's starter sits over the body's middle), then a line.
      const firstLine = { position: { x: 24, y: 12 } }
      if (form === "phone") await body.tap(firstLine)
      else await body.click(firstLine)
      await page.keyboard.type(LINE, { delay: 20 })
      await expect(body, "the line typed with no network is in the editor").toContainText(LINE, { timeout: 10_000 })
      // Longer than the chunk probe's 4 s: no reload comes later either.
      await page.waitForTimeout(5_000)
      expect(navigations, "the page never reloaded").toBe(0)
      await expect(body).toContainText(LINE)

      await networkReturns()
      await expect
        .poll(() => [...relay.docs.values()].map((d) => d.getXmlFragment("default").toString()).join("\n"), { timeout: 60_000 })
        .toContain(LINE)
      await expect(body).toContainText(LINE)
      expect(navigations).toBe(0)
    })
  })
}
