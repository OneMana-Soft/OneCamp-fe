import { expect, test } from "@playwright/test"

import { docInfo, stubBackend } from "./stubbedApp"

// On a narrow phone (312 px), a doc's title in the top bar ran into its
// Comments icon. It must end in an ellipsis, with clear space before the icons.

const DOC = "7d2c9a4e-3b1f-4e8a-9c6d-5f0a1b2c3d4e"

test.use({ viewport: { width: 312, height: 680 }, isMobile: true, hasTouch: true })

test("a long doc title truncates before the phone bar's icons at 312 px", async ({ page }, testInfo) => {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch sync notes for the autumn release" }),
  })
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })

  const title = page.locator("[data-phone-bar] [data-doc-phone-title]")
  await expect(title).toHaveText("Launch sync notes for the autumn release", { timeout: 30_000 })
  const comments = page.locator("[data-phone-bar]").getByRole("link", { name: /^Comments/ })
  await expect(comments).toBeVisible()

  // Clear space between the title's box and the first icon, once the bar has
  // settled (a page comes in with a short slide).
  await expect
    .poll(async () => {
      const t = (await title.boundingBox())!
      const c = (await comments.boundingBox())!
      return c.x - (t.x + t.width)
    }, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(8)
  // Cut short with an ellipsis, not clipped or wrapped.
  const cut = await title.evaluate((el) => ({
    truncated: el.scrollWidth > el.clientWidth,
    ellipsis: getComputedStyle(el).textOverflow,
    lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || "20")),
  }))
  expect(cut).toEqual({ truncated: true, ellipsis: "ellipsis", lines: 1 })
})

test("a short title sits whole, in the middle of the bar", async ({ page }, testInfo) => {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Notes" }),
  })
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const title = page.locator("[data-phone-bar] [data-doc-phone-title]")
  await expect(title).toHaveText("Notes", { timeout: 30_000 })
  const truncated = await title.evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(truncated).toBe(false)
})
