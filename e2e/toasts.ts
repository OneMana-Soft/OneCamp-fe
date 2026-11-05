import { expect, type Locator, type Page } from "@playwright/test"

/**
 * A toast's words, read where the toast is drawn: the app's one toast list
 * (components/ui/toast.tsx, labelled "Notifications (Alt+T)"). While a toast
 * opens, Radix's announcer repeats its words for screen readers for about a
 * second, outside the list ("Notification <words>"), so a page-wide getByText
 * matches twice and a strict read fails whenever it lands in that second.
 * Exact words, so a title and its description are read apart.
 */
export function toast(page: Page, words: string): Locator {
  return page.getByRole("region", { name: "Notifications (Alt+T)", exact: true }).getByText(words, { exact: true })
}

/** The toast list itself, for counting what is on it. */
export const toastRegion = (page: Page): Locator => page.getByRole("region", { name: "Notifications (Alt+T)", exact: true })

/**
 * That no toast says `words`, in part (no toast at all, without them), counted once after `settle` ms. A toast stays 6 s, so a
 * retrying toHaveCount(0) passes once it has gone and can't fail (V-410). A failed write's shared toast comes a task
 * after the failure (lib/http/writeFailure), a failed read's a beat after (lib/http/loadFailure).
 */
export async function expectNoToast(page: Page, words?: string, settle = 1_500): Promise<void> {
  await page.waitForTimeout(settle)
  const on = words === undefined ? toastRegion(page).getByRole("listitem") : toastRegion(page).getByText(words)
  expect(await on.count(), `a toast says ${words ?? "something"}`).toBe(0)
}

/**
 * That the toast holding `words` is drawn on top: at its centre, read at rest, the page's topmost box is the toast's
 * own (V-491). toBeVisible passes on a toast an overlay covers, as Excalidraw's dialog layer covered a refused
 * export's, so a toast said over a dialog or a sheet is checked here.
 */
export async function expectToastOnTop(words: Locator): Promise<void> {
  const top = await words.evaluate(async (el) => {
    const item = el.closest("li") ?? el
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    let last = ""
    for (let i = 0; i < 30; i++) {
      const r = item.getBoundingClientRect()
      const box = `${r.x} ${r.y} ${r.width} ${r.height}`
      if (box === last) break
      last = box
      await frame()
    }
    const r = item.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { onTop: !!hit && item.contains(hit), hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)}` : "nothing" }
  })
  expect(top.onTop, `the toast is under ${top.hit}`).toBe(true)
}
