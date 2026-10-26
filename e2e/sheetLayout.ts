import type { Locator, Page } from "@playwright/test"

/**
 * How a phone sheet (components/ui/drawer) lays out, measured in the browser,
 * for the rules every sheet keeps (design v3, mobile C5):
 *
 *   - One scroller. The sheet's body is the one thing that scrolls up and
 *     down, and a sheet that fits what it holds doesn't scroll at all;
 *     nothing inside it is a second scroller with a height cap of its own
 *     (two scroll bars, and a flick that moves the wrong one).
 *   - Nothing runs sideways. A box that scrolls up and down can scroll
 *     sideways too (an overflow that isn't visible turns the other axis to
 *     auto), so content a few px too wide gave the status sheet a sideways
 *     bar. A row meant to scroll sideways (a bar of chips) says so: it
 *     scrolls only sideways (overflow-y hidden or clip).
 *   - No modal over a sheet: the next step happens in the sheet itself, or in
 *     a sheet of its own over it, whose scrim then lies over the one below.
 *   - As tall as what it holds: no empty slab under the content.
 *   - Nothing cut off at a scroller's edge: a field's 4px halo, a focus ring.
 *   - Nothing squashed: a section of the sheet stands at its own height, and
 *     the body scrolls past it. A flex column that shrinks its children to
 *     fit cut the share sheet's General access to a 12px sliver on a phone
 *     held sideways (DESIGN-BUILD-3, 20 Oct 2026).
 *   - Nothing written on it by script that outlives its moment (vaul's input
 *     repositioning left a height and a bottom once the keyboard went).
 */
export interface SheetLayout {
  /** The detent the sheet declares (menu, medium, half, large). */
  detent: string
  /** The sheet's own height, its cap, and the visible screen's, in px. */
  height: number
  cap: number
  viewport: number
  /** Empty space between the bottom of what the sheet shows and its own bottom edge, in px (the home-indicator strip excluded). */
  emptyBelow: number
  /** Things in the sheet that scroll up and down now: more content than room. */
  vertical: string[]
  /** Things in the sheet with a height cap of their own that scroll up and down: a nested list, whether or not it is full at this size. */
  nested: string[]
  /** Things whose content runs past the sides of a box that scrolls up and down (where a finger would pan it sideways, or it clips). */
  sideways: string[]
  /** Whether the page behind is pushed back as a card (a large sheet). */
  pageScaled: boolean
  /** Fields whose 4px halo would pass the edge of the box that clips them (a scroller, the sheet), with the px short. */
  clipped: string[]
  /** What script has written on the sheet's own height and bottom. */
  inline: { height: string; bottom: string }
  /** Boxes a flex column squeezed below their content: what they hold, in the flow, runs past their bottom (cut off or spilling). */
  squashed: string[]
}

/** The sheet on top: the last one open. */
export function topSheet(page: Page): Locator {
  return page.locator('[data-vaul-drawer][data-state="open"]').last()
}

/** `el` has stopped moving, a sheet's rise or a growth done: the same box for six frames. */
export function settled(el: Locator): Promise<void> {
  return el.evaluate(
    (node) =>
      new Promise<void>((done) => {
        let last = ""
        let same = 0
        const frame = () => {
          const r = node.getBoundingClientRect()
          const box = `${r.x} ${r.y} ${r.width} ${r.height}`
          same = box === last ? same + 1 : 0
          last = box
          if (same >= 6) done()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
  )
}

/** Measures `sheet` (a [data-vaul-drawer]) as SheetLayout. */
export async function sheetLayout(sheet: Locator): Promise<SheetLayout> {
  return sheet.evaluate((root: HTMLElement) => {
    const name = (el: Element) => {
      const h = el as HTMLElement
      const tag = h.tagName.toLowerCase()
      const label = h.getAttribute("aria-label") || h.getAttribute("role") || ""
      const data = Array.from(h.attributes)
        .filter((a) => a.name.startsWith("data-") && !a.name.startsWith("data-state") && a.name !== "data-press")
        .map((a) => `[${a.name}]`)
        .slice(0, 2)
        .join("")
      const cls = (h.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".")
      return `${tag}${data}${label ? `"${label}"` : ""}${cls ? `.${cls}` : ""}`
    }
    const scrolls = (v: string) => v === "auto" || v === "scroll"
    const field = (el: Element) => el.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']")
    const body = root.querySelector<HTMLElement>(":scope > [data-sheet-body]") ?? Array.from(root.children).reverse().find((c) => scrolls(getComputedStyle(c).overflowY)) ?? null
    const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]

    const vertical: string[] = []
    const nested: string[] = []
    const sideways: string[] = []
    for (const el of all) {
      const s = getComputedStyle(el)
      if (s.display === "none" || field(el)) continue
      if (!scrolls(s.overflowY)) continue
      if (el.scrollHeight > el.clientHeight + 1) vertical.push(name(el))
      if (el !== body && el !== root && s.maxHeight !== "none") nested.push(name(el))
      // Its content's own boxes against its sides (a control's reach, a
      // ::before, is no box of its own); what a box inside clips is that
      // box's to keep, and a row meant to go sideways is one.
      const box = el.getBoundingClientRect()
      const left = box.left + el.clientLeft
      const right = left + el.clientWidth
      const past: string[] = []
      for (const d of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
        let clipped = false
        for (let a = d.parentElement; a && a !== el; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible") {
            clipped = true
            break
          }
        }
        if (clipped) continue
        const r = d.getBoundingClientRect()
        if (r.width === 0 || r.height === 0 || getComputedStyle(d).position === "fixed") continue
        if (r.left < left - 1 || r.right > right + 1) past.push(`${name(d)} ${Math.round(r.left - left)}..${Math.round(r.right - right)}`)
      }
      if (past.length) sideways.push(`${name(el)}: ${past.slice(0, 3).join(", ")}`)
    }

    const box = root.getBoundingClientRect()
    const padBottom = parseFloat(getComputedStyle(root).paddingBottom) || 0
    let contentBottom = box.top
    for (const el of Array.from((body ?? root).querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const s = getComputedStyle(el)
      if (s.visibility === "hidden" || s.position === "fixed") continue
      contentBottom = Math.max(contentBottom, Math.min(r.bottom, box.bottom))
    }
    // A field's halo is 4px of box-shadow (--ix-halo): it shows only inside
    // every box that clips the field (each ancestor whose overflow isn't
    // visible, the sheet included) and inside the screen's own sides.
    const clipped: string[] = []
    const HALO = 4
    for (const f of Array.from(root.querySelectorAll<HTMLElement>(".field-surface, .hub-field, input:not([type='hidden']):not(.sr-only), textarea"))) {
      const r = f.getBoundingClientRect()
      const frame = f.parentElement?.closest(".hub-field, .field-surface")
      if (r.width === 0 || r.height === 0 || frame) continue
      const edges: { by: string; left: number; right: number }[] = [{ by: "the screen", left: 0, right: window.innerWidth }]
      for (let a: HTMLElement | null = f.parentElement; a; a = a === root ? null : a.parentElement) {
        const s = getComputedStyle(a)
        if (s.overflowX === "visible" && s.overflowY === "visible") continue
        const c = a.getBoundingClientRect()
        edges.push({ by: name(a), left: c.left + a.clientLeft, right: c.left + a.clientLeft + a.clientWidth })
      }
      for (const e of edges) {
        const short = Math.min(r.left - HALO - e.left, e.right - (r.right + HALO))
        if (short < -0.5) clipped.push(`${name(f)} by ${e.by}: ${Math.round(short)}px`)
      }
    }
    const squashed: string[] = []
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const parent = el.parentElement
      if (!parent || field(el)) continue
      const s = getComputedStyle(el)
      const p = getComputedStyle(parent)
      if (!/flex/.test(p.display) || !p.flexDirection.startsWith("column") || s.display === "none" || s.display === "contents") continue
      if (scrolls(s.overflowY) || (s.webkitLineClamp && s.webkitLineClamp !== "none")) continue
      // Its own boxes in the flow, not a positioned one or a control's 44px reach (a ::before).
      const bottom = el.getBoundingClientRect().bottom
      const past = Array.from(el.children).filter((c) => {
        const cs = getComputedStyle(c)
        const r = c.getBoundingClientRect()
        return cs.position !== "absolute" && cs.position !== "fixed" && r.height > 0 && r.bottom > bottom + 2
      })
      if (past.length) squashed.push(`${name(el)}: ${past.slice(0, 2).map((c) => `${name(c)} ${Math.round(c.getBoundingClientRect().bottom - bottom)}px past`).join(", ")}`)
    }
    const wrapper = document.querySelector<HTMLElement>("[data-vaul-drawer-wrapper]")
    const cap = parseFloat(getComputedStyle(root).maxHeight)
    return {
      detent: root.getAttribute("data-detent") ?? "",
      height: Math.round(box.height),
      cap: Number.isFinite(cap) ? Math.round(cap) : Infinity,
      viewport: Math.round(window.visualViewport?.height ?? window.innerHeight),
      emptyBelow: Math.max(0, Math.round(box.bottom - padBottom - contentBottom)),
      vertical,
      nested,
      sideways,
      pageScaled: !!wrapper && /scale\(/.test(wrapper.style.transform),
      clipped,
      inline: { height: root.style.height, bottom: root.style.bottom },
      squashed,
    }
  })
}

/**
 * What is laid over an open sheet: Radix dialogs that aren't sheets (a
 * modal), and popovers (a floating box; a phone's field opens a sheet of its
 * own instead). Empty while no sheet is open.
 */
export async function layersOverSheet(page: Page): Promise<{ modals: string[]; popovers: string[] }> {
  return page.evaluate(() => {
    const out = { modals: [] as string[], popovers: [] as string[] }
    if (!document.querySelector('[data-vaul-drawer][data-state="open"]')) return out
    const named = (d: HTMLElement) => d.getAttribute("aria-label") || d.querySelector("h2")?.textContent?.trim() || d.className.split(/\s+/).slice(0, 3).join(".")
    for (const d of Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'))) {
      if (d.hasAttribute("data-vaul-drawer")) continue
      if (d.closest("[data-radix-popper-content-wrapper]")) out.popovers.push(named(d))
      else out.modals.push(named(d))
    }
    return out
  })
}

/**
 * With a sheet open over another: whether the top sheet's scrim is painted
 * over the sheet under it (dimming it, as the page is), by their stacking:
 * z-index, then the order they come in. Null with fewer than two open.
 */
export async function scrimOverLowerSheet(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const open = Array.from(document.querySelectorAll<HTMLElement>('[data-vaul-drawer][data-state="open"]'))
    if (open.length < 2) return null
    const lower = open[open.length - 2]
    const scrim = Array.from(document.querySelectorAll<HTMLElement>("[data-vaul-overlay]")).pop()
    if (!scrim) return false
    const z = (el: HTMLElement) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0
    if (z(scrim) !== z(lower)) return z(scrim) > z(lower)
    return !!(lower.compareDocumentPosition(scrim) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
}
