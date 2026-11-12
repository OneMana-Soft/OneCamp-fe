import { expect, type Locator, type Page } from "@playwright/test"

// A sheet's one scroller ([data-sheet-body], data-edge-fade="block",
// app/interaction.css) fades the edge it has more content past, and a part
// pinned to an edge inside it (sticky: a picker's filter, a time panel's box,
// the event card's "Going?") holds that edge's fade at none, so the part is
// never faded (components/ui/sheetPins, V-619). Where scroll timelines aren't,
// the scroller clips as before and nothing fades. Read by the specs that open
// such sheets (e2e/sheetEdgeFade, comboboxSheet, momentFields, calendarAnswers).

/** The scroller's fade as the browser draws it, once the scroll has drawn: its mark, whether it has a mask, and its two edges. */
export const fadeOf = (scroller: Locator) =>
  scroller.evaluate(async (el) => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    const s = getComputedStyle(el)
    const mask = s.getPropertyValue("mask-image") || s.getPropertyValue("-webkit-mask-image") || "none"
    return { mark: el.getAttribute("data-edge-fade"), masked: mask !== "none", top: s.getPropertyValue("--ix-fade-s").trim() || "0px", foot: s.getPropertyValue("--ix-fade-e").trim() || "0px" }
  })

/** Whether the browser has scroll timelines, which the fade runs on. */
export const timelines = (page: Page) => page.evaluate(() => CSS.supports("animation-timeline: scroll()"))

/** How far the scroller scrolls. */
export const scrollRoom = (scroller: Locator) => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)

/**
 * A part pinned to one edge of its sheet's body, read with the rest scrolled
 * halfway under it, so there is more past both edges: the part (its sticky box,
 * found from `part`, something in it) is whole, inside the body's visible box
 * and drawn over what scrolls under it; its edge doesn't fade; the other edge
 * does (24px where scroll timelines are, none where not); a part pinned to the
 * top casts a band over what scrolls under it, gone at the top. A sheet that fits
 * (`fits`) has no scroll: the part is whole and nothing fades. Leaves the body
 * scrolled, for the caller's shot; returns the body.
 */
export async function expectPinWhole(page: Page, part: Locator, edge: "top" | "foot", { fits = false }: { fits?: boolean } = {}): Promise<Locator> {
  const body = part.locator("xpath=ancestor::*[@data-sheet-body][1]")
  const on = await timelines(page)
  if (fits) {
    await expect.poll(() => scrollRoom(body), { message: "the sheet scrolls" }).toBe(0)
  } else {
    await expect.poll(() => scrollRoom(body), { message: "the sheet fits: nothing to scroll under the part" }).toBeGreaterThan(48)
    await body.evaluate((el) => void (el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2)))
  }
  const other = !fits && on ? "24px" : "0px"
  await expect.poll(() => fadeOf(body), { message: `pinned at its ${edge}` }).toEqual({ mark: "block", masked: on, top: edge === "top" ? "0px" : other, foot: edge === "foot" ? "0px" : other })
  await expect(part).toBeInViewport({ ratio: 1 })
  // Polled: a sheet whose content arrives after it opens (an event card's calendar line) settles its height a beat later,
  // and the pin is judged once it has.
  const pin = () => part.evaluate((el, edge) => {
    const body = el.closest("[data-sheet-body]")!
    let at: Element | null = el
    while (at && at !== body && getComputedStyle(at).position !== "sticky") at = at.parentElement
    if (!at || at === body) return { sticky: false }
    const box = at
    const b = body.getBoundingClientRect()
    const r = box.getBoundingClientRect()
    const inside = r.top >= Math.max(b.top, 0) - 0.5 && r.bottom <= Math.min(b.bottom, window.innerHeight) + 0.5 && r.left >= b.left - 0.5 && r.right <= b.right + 0.5
    // Drawn over what scrolls under it: its middle line, end to end, is its own.
    const y = (r.top + r.bottom) / 2
    const onTop = [r.left + 4, (r.left + r.right) / 2, r.right - 4].every((x) => {
      const hit = document.elementFromPoint(x, y)
      return !!hit && box.contains(hit)
    })
    return { sticky: true, marked: !!body.closest(`[data-pinned-${edge}]`), inside, onTop }
  }, edge)
  await expect.poll(pin, { message: `the part pinned at its sheet's ${edge} isn't whole` }).toEqual({ sticky: true, marked: true, inside: true, onTop: true })
  if (edge === "top" && !fits) {
    // While there is more above, what scrolls under it fades into the sheet at its foot, a band in the sheet's colour;
    // at the top there is none (app/phone.css; V-619: a row's foot cut off behind it read as stray marks). Every engine.
    const band = () => part.evaluate((el) => {
      const pin = el.closest("[data-pins-top]")
      return !!pin && / 0px 20px 16px 0px/.test(getComputedStyle(pin).boxShadow)
    })
    await expect.poll(band, { message: "no band under the top pin while there is more above" }).toBe(true)
    const at = await body.evaluate((el) => el.scrollTop)
    await body.evaluate((el) => void (el.scrollTop = 0))
    await expect.poll(band, { message: "the band under the top pin stays at the top" }).toBe(false)
    await body.evaluate((el, at) => void (el.scrollTop = at), at)
    await expect.poll(band, { message: "no band under the top pin once scrolled back" }).toBe(true)
  }
  return body
}
