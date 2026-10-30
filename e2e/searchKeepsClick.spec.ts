import { expect, test } from "@playwright/test"

import { docInfo, holdPages, longerWait, stubBackend } from "./stubbedApp"

// A result opened just after typing a search opens (26 Oct 2026). The search
// page writes what is typed into its address a moment after the last key, for
// Back, a reload and a shared link. That write was a navigation, and Next keeps
// only the latest: landing while the result's page was still loading, it
// cancelled the click, and the person stayed on the search.

const id = (n: number) => `${n.toString(16).padStart(8, "0")}-6b7c-4d8e-9f0a-1b2c3d4e5f60`
const DOC = id(1)

/** Two docs for any search, its text read as typed. */
function hits(_url: URL, request: { postDataJSON(): unknown }) {
  const { q } = request.postDataJSON() as { q: string }
  return {
    data: {
      page: [1, 2].map((n) => ({ type: "doc", doc: { doc_uuid: id(n), doc_title: `Budget review ${n}`, created_date: 1791614952 - n } })),
      totals: { doc: 2 },
      total: 2,
      has_more: false,
      notes: [],
      query: { runs: true, issues: [], text: q },
    },
  }
}

for (const s of [
  { name: "a computer, by mouse", viewport: { width: 1280, height: 860 }, touch: false },
  { name: "a phone, by touch", viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`a result opened just after typing a search, on ${s.name}`, () => {
    test.use({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch, contextOptions: { reducedMotion: "reduce" } })

    test("opens, and Back finds the search as it was typed", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      // The page's 150 ms wait before it writes lasts 1.2 s here.
      await longerWait(page, 150, 1_200)
      await stubBackend(page, testInfo, {
        "/query/search": hits,
        [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Budget review 1" }),
      })
      // The doc's page is held, so the click's move to it is on its way when the address is written.
      const letDocGo = await holdPages(page, (url) => url.pathname.startsWith("/app/doc/"))
      await page.goto("/app/search?query=budget", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const box = page.getByRole("searchbox", { name: "Search" })
      const hit = page.locator(`[data-search-result][href="/app/doc/${DOC}"]`)
      await expect(hit).toBeVisible({ timeout: 60_000 })

      if (s.touch) await box.tap()
      else await box.click()
      await box.press("End")
      await page.keyboard.type(" review", { delay: 30 })
      // The person's pause between the last key and the click: the scenario, not a wait for the page.
      await page.waitForTimeout(100)
      if (s.touch) await hit.tap()
      else await hit.click()
      // The search reaches the address while the doc is still on its way: at the
      // press, or (before) after the page's wait, cancelling the click's move.
      await expect(page, "the search in the address").toHaveURL((url) => url.searchParams.get("query") === "budget review", { timeout: 15_000 })
      letDocGo()
      await expect(page, "the click opens the doc").toHaveURL((url) => url.pathname === `/app/doc/${DOC}`, { timeout: 15_000 })

      // The search was written before the click left, into its own entry.
      await page.goBack()
      await expect(page, "Back finds the search as it was typed").toHaveURL((url) => url.pathname === "/app/search" && url.searchParams.get("query") === "budget review", { timeout: 15_000 })
      await expect(box).toHaveValue("budget review")
    })
  })
}
