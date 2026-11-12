import { markAttribute } from "@/lib/ui/markAttribute"

/**
 * A part that stays at an edge of a sheet's body while the rest scrolls under
 * it (sticky: a picker's filter, a time panel's box, a menu's group that
 * destroys) is that edge, so it marks the body data-pinned-top or
 * data-pinned-foot, and the body's fade (data-edge-fade="block", or a held
 * body's in it; app/interaction.css) leaves that edge whole: a fade there
 * faded the part (V-619). The part marks itself data-pins-top or
 * data-pins-foot, so what scrolls under it fades into the sheet at its edge
 * (app/phone.css): rows cut off behind it read as stray marks. A sheet that draws such a part itself says so on its
 * DrawerContent, with no script (the emoji sheet, the event card's "Going?").
 * Marked by the part, not found by :has() (lib/ui/markAttribute). Apart from
 * components/ui/moreMarks, which every first load carries: only parts loaded
 * later pin. Ref callbacks; each returns its undo.
 */
export const pinsSheetTop = (el: HTMLElement | null) => pinSheetEdge(el, "top")
export const pinsSheetFoot = (el: HTMLElement | null) => pinSheetEdge(el, "foot")

function pinSheetEdge(el: HTMLElement | null, edge: "top" | "foot"): (() => void) | undefined {
  if (!el) return undefined
  const undo: Array<() => void> = []
  markAttribute(el.closest("[data-sheet-body]"), `data-pinned-${edge}`, undo)
  markAttribute(el, `data-pins-${edge}`, undo)
  return () => undo.splice(0).forEach((u) => u())
}
