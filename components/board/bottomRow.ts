import * as React from "react"
import { PHONE_FOOTER, TOOL_ROW, TOOL_SECTION, ZOOM_CLUSTER, useExcalidrawParts } from "@/components/board/excalidrawPart"
import { placeBottomRow } from "@/lib/board/bottomRow"

// The board's bottom row on a computer, one measured layout at every width:
// the rules are lib/board/bottomRow's; this finds the islands, measures them
// and writes their places on the page's element (excalidrawTheme.css). Where
// Excalidraw draws its MobileMenu (its own box under 730 px) there's no zoom
// cluster and its tool row is at the top: the same rules place the pill there.

const PILL = "[data-board-create]"
const BAR = "[data-facilitation]"
const MAP = "[data-board-map]"
const PARTS = [TOOL_ROW, TOOL_SECTION, ZOOM_CLUSTER, PHONE_FOOTER, PILL, BAR, MAP].join(", ")

/**
 * `el`'s top in `page` by layout (its offsets), not as drawn: an island rising in at 98% (content-float) is drawn
 * up to 4.4 px low, and no resize follows when it settles. Null when its offset parents don't lead to the page.
 */
function layoutTop(el: HTMLElement, page: HTMLElement): number | null {
  let top = 0
  for (let e: HTMLElement | null = el; e !== page; e = e.offsetParent as HTMLElement | null) {
    if (!e) return null
    top += e.offsetTop
  }
  return top
}

const VARS = ["--board-row-shift", "--board-cluster-lift", "--board-pill-x", "--board-pill-y", "--board-facilitation-x", "--board-facilitation-max", "--board-facilitation-lift"] as const

/**
 * Lays out the bottom row of the board page `page` (its own element) while
 * `on` (a computer), and again whenever the board or an island changes size or
 * an island comes or goes. It writes the places as CSS variables on `page`,
 * and data-board-row ("one" or "two") once they're written: the pill stays
 * hidden until then.
 */
export function useBottomRow(page: HTMLElement | null, on: boolean): void {
  const parts = useExcalidrawParts(page, PARTS, on)
  React.useLayoutEffect(() => {
    const find = (s: string) => parts.find((p) => p.matches(s)) ?? null
    // The first tool row is the shapes' (in the MobileMenu a second one is its footer's).
    const tools = find(TOOL_ROW)
    // None in Excalidraw's MobileMenu: the row is at the top, and only the pill is placed.
    const cluster = find(ZOOM_CLUSTER)
    if (!page || !tools) return
    const pill = find(PILL)
    // Excalidraw's phone footer, where it draws no cluster (its MobileMenu): the bar stands over it.
    const foot = cluster ? null : find(PHONE_FOOTER)
    const bar = find(BAR)
    const map = find(MAP)
    const style = page.style
    // What's written now: the row's shift and the cluster's rise are in what's measured.
    let shift = 0
    let lift = 0
    const write = (name: (typeof VARS)[number], px: number) => style.setProperty(name, `${px}px`)
    const place = () => {
      const p = page.getBoundingClientRect()
      const t = tools.getBoundingClientRect()
      const c = cluster?.getBoundingClientRect() ?? null
      if (!p.width || !t.width || (c && !c.width)) return
      const m = map?.getBoundingClientRect()
      const f = foot?.getBoundingClientRect()
      const row = placeBottomRow({
        width: p.width,
        height: p.height,
        tools: { left: t.left - p.left, width: t.width, top: t.top - p.top, height: t.height },
        cluster: c ? { left: c.left - p.left, top: c.top - p.top + lift, width: c.width, height: c.height } : null,
        map: m ? { left: m.left - p.left, top: m.top - p.top + lift, width: m.width, height: m.height } : null,
        // Layout boxes, not drawn ones: the pill and the bar rise in at 98% (content-float).
        pill: pill ? { width: pill.offsetWidth, height: pill.offsetHeight } : null,
        bar: bar ? { width: bar.offsetWidth, top: layoutTop(bar, page) ?? bar.getBoundingClientRect().top - p.top, height: bar.offsetHeight } : null,
        foot: f && f.height ? { top: f.top - p.top } : null,
      })
      shift = Math.round(shift + row.centre - (t.left - p.left + t.width / 2))
      lift = row.lift
      write("--board-row-shift", shift)
      write("--board-cluster-lift", lift)
      if (row.pill) {
        // In the pill's own containing box: under the board's band (V-75) the canvas, and the pill with it, start lower.
        const own = (pill?.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? p
        write("--board-pill-x", row.pill.left + Math.round(p.left - own.left))
        write("--board-pill-y", row.pill.top + Math.round(p.top - own.top))
      }
      if (row.bar) {
        write("--board-facilitation-x", row.bar.centre - Math.round(p.width / 2))
        write("--board-facilitation-max", row.bar.max)
        write("--board-facilitation-lift", row.bar.lift)
      }
      page.setAttribute("data-board-row", lift ? "two" : "one")
    }
    const watch = new ResizeObserver(place)
    for (const el of [page, tools, find(TOOL_SECTION), cluster, foot, pill, pill?.offsetParent, bar, map]) if (el) watch.observe(el)
    place()
    return () => {
      watch.disconnect()
      for (const name of VARS) style.removeProperty(name)
      page.removeAttribute("data-board-row")
    }
  }, [page, parts])
}
