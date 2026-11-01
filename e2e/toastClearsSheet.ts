import { expect, test, type Locator } from "@playwright/test"

/**
 * On a phone, while a sheet is open, a toast keeps off its header, its
 * buttons and its foot (V-111, DESIGN-BUILD-43): the toast holding `words`
 * lies inside the screen and, while there is room for it above the sheet,
 * over none of the sheet. With no room there it lies over the sheet's
 * content, 8px under its header row (components/ui/toastFootSlot), so a tall
 * sheet's first field may be under it, as under any toast over a page; never
 * its header row (its grabber, its header, its title and what stands beside
 * it), its foot or the field in use. A sheet is whatever carries the sheet
 * primitives' one mark, [data-v3-sheet], while it says it is open: a drawer,
 * a dialog or a confirm drawn as a sheet, or the task's sheet (OverlaySheet).
 * Read at rest (the same box two frames apart), so a toast still rising can't
 * pass on its way to a button. Returns the parts it kept the toast off, also
 * annotated on the test ("kept clear"), so a leg can say which must be there.
 */
export async function expectToastClearsSheet(words: Locator) {
  const read = () =>
    words.evaluate(async (el) => {
      const toast = el.closest("li") ?? el
      const box = () => toast.getBoundingClientRect()
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const a = box()
      await frame()
      const t = box()
      const atRest = Math.abs(a.top - t.top) < 0.5 && Math.abs(a.height - t.height) < 0.5
      const sheets = [...document.querySelectorAll('[data-v3-sheet][data-state="open"]')]
      const sheet = sheets[sheets.length - 1]
      if (!sheet) return { atRest, sheet: false, under: ["no open sheet"], clear: [] as string[] }
      const meets = (r: DOMRect) => r.width > 0 && r.height > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top
      // Room over the sheet for it: 8px from the screen's top and from the sheet.
      const room = sheet.getBoundingClientRect().top >= t.height + 16
      const title = document.getElementById(sheet.getAttribute("aria-labelledby") ?? "")
      const row = title?.getBoundingClientRect()
      // With no room, the parts the toast keeps off: the header row, the foot and the field in use.
      const kept = (p: Element) => {
        const r = p.getBoundingClientRect()
        const besideTitle = !!row && row.height > 1 && r.top < row.bottom && r.bottom > row.top
        return besideTitle || p === document.activeElement || !!p.closest("[data-sheet-header], [data-sheet-footer], .v3-dlg-footer")
      }
      const controls = 'button, a[href], input, select, textarea, [contenteditable="true"], [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [data-v3-grabber]'
      const parts: [string, Element][] = [...sheet.querySelectorAll(controls)]
        .filter((p) => room || p.hasAttribute("data-v3-grabber") || kept(p))
        .map((p) => [p.hasAttribute("data-v3-grabber") ? "the grabber" : p.getAttribute("aria-label") || p.textContent?.trim() || p.tagName, p])
      for (const h of sheet.querySelectorAll("[data-sheet-header]")) parts.push(["the header", h])
      if (title) parts.push([`the title "${title.textContent?.trim()}"`, title])
      const under = parts.filter(([, p]) => meets(p.getBoundingClientRect())).map(([name]) => name)
      if (room && meets(sheet.getBoundingClientRect())) under.push("the sheet, with room over it")
      if (t.top < 0 || t.bottom > innerHeight) under.push("off the screen")
      return { atRest, sheet: true, under, clear: parts.map(([name]) => name) }
    })
  let clear: string[] = []
  await expect
    .poll(async () => {
      const r = await read()
      clear = r.clear
      return { atRest: r.atRest, sheet: r.sheet, under: r.under }
    }, { message: "at rest, the toast lies over none of the open sheet's header row, its foot or the field in use, and over none of it with room above", timeout: 5_000 })
    .toEqual({ atRest: true, sheet: true, under: [] })
  test.info().annotations.push({ type: "kept clear", description: clear.join(", ") })
  return clear
}
