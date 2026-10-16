import { expect, test } from "@playwright/test"

import { docInfo, stubBackend } from "./stubbedApp"

// A doc's reading type, as the browser computes it from the built CSS
// (content.md D06, D07): body 16/26 at -0.011em in a 720 px measure, title
// 40/48 at 650 (D-1). The body computed 16/24: a later rule with the same selector
// won the cascade (components/docEditor/docMeasure.test.ts reads the rules).

const DOC = "3c9e1f7a-5b2d-4e6f-8a1c-9d0b2e4f6a8c"

test.use({ viewport: { width: 1280, height: 900 } })

test("a doc reads at 16/26 in a 720 px measure, under a 40/48 title", async ({ page }, testInfo) => {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({
      doc_uuid: DOC,
      doc_title: "Launch sync notes",
      doc_body: `<p>${"The launch moves to Thursday, and the notes say why. ".repeat(12)}</p><p>Second paragraph.</p><ul><li><p>A point</p></li></ul>`,
    }),
  })
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })

  const paragraph = page.locator(".doc-editor .ProseMirror p").first()
  await expect(paragraph).toBeVisible({ timeout: 30_000 })
  const body = await paragraph.evaluate((el) => {
    const s = getComputedStyle(el)
    return { size: s.fontSize, leading: s.lineHeight, tracking: s.letterSpacing, width: el.getBoundingClientRect().width }
  })
  expect(body.size).toBe("16px")
  expect(body.leading).toBe("26px")
  expect(parseFloat(body.tracking)).toBeCloseTo(-0.176, 2)
  expect(body.width).toBeLessThanOrEqual(720)
  expect(body.width).toBeGreaterThan(600)
  // What has no rule of its own (a list's row, its marker, a to-do's box)
  // takes the body's leading from the editor: that was 24px.
  const inherited = await paragraph.evaluate((el) => {
    const root = el.closest(".ProseMirror")!
    const li = root.querySelector("li")!
    return { root: getComputedStyle(root).lineHeight, item: getComputedStyle(li).lineHeight }
  })
  expect(inherited).toEqual({ root: "26px", item: "26px" })

  const title = page.locator("h1 [data-doc-title]")
  await expect(title).toHaveValue("Launch sync notes")
  const heading = await title.evaluate((el) => {
    const s = getComputedStyle(el)
    return { size: s.fontSize, leading: s.lineHeight, weight: s.fontWeight }
  })
  expect(heading).toEqual({ size: "40px", leading: "48px", weight: "650" })
  // The page's heading is the doc's title.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
})
