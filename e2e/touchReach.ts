import type { Page } from "@playwright/test"

/**
 * Where a finger reaches a control: the touch target rule (app/phone.css F3)
 * gives anything with data-touch-target, and the shell's icon button, a box
 * centred on it at least 44px (--m-hit) each way. Two different controls whose
 * boxes overlap share taps: the later one in the page takes the overlap, so a
 * tap on the first one's edge does the second one's action. A row is fixed by
 * spacing on a touch screen (a gap of at least 44 minus the size), never by
 * shrinking the reach.
 */
export interface Reach {
  /** What the control is called, for the failure message. */
  name: string
  left: number
  top: number
  right: number
  bottom: number
}

const HIT = 44

/**
 * Every touch target shown inside `row` (a selector) with its reach, as the
 * rule draws it. Throws when the rule isn't on (no ::before), so a run that
 * isn't a touch screen fails instead of passing on nothing.
 */
export async function reachesIn(page: Page, row: string): Promise<Reach[]> {
  return page.evaluate(
    ([selector, hit]) => {
      const rows = Array.from(document.querySelectorAll(selector as string))
      if (rows.length === 0) throw new Error(`no ${selector} on the page`)
      const out: Reach[] = []
      for (const rowEl of rows) {
        for (const el of Array.from(rowEl.querySelectorAll<HTMLElement>(":is([data-touch-target], .shell-icon-btn)"))) {
          const box = el.getBoundingClientRect()
          const style = getComputedStyle(el)
          // A control that takes no taps (pointer-events: none, as Send and
          // Record are while the other has their shared place) reaches nothing.
          if (box.width === 0 || box.height === 0 || style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") continue
          if (getComputedStyle(el, "::before").content === "none") throw new Error("the touch target rule is off: run this on a touch screen")
          const w = Math.max(hit as number, box.width)
          const h = Math.max(hit as number, box.height)
          const cx = box.left + box.width / 2
          const cy = box.top + box.height / 2
          const name = el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName.toLowerCase()
          out.push({ name, left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 })
        }
      }
      return out
    },
    [row, HIT] as const,
  )
}

/** Each pair of different controls whose reach overlaps, named. Pure. */
export function overlapping(reaches: Reach[]): string[] {
  const out: string[] = []
  for (let i = 0; i < reaches.length; i++) {
    for (let j = i + 1; j < reaches.length; j++) {
      const a = reaches[i]
      const b = reaches[j]
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      // Half a pixel either way is rounding, not a shared tap.
      if (x > 0.5 && y > 0.5) out.push(`"${a.name}" and "${b.name}" share ${Math.round(x)}×${Math.round(y)} px`)
    }
  }
  return out
}
