// A list in a phone's sheet whose cut falls clean at a row's edge reads as the whole list: nothing says it scrolls
// (a phone held sideways, Frames' eight sizes in four rows' room). While the sheet's body can't hold the list, its
// foot comes up so the cut falls across a row's middle, and the part-row says there is more (miro-11 F1,
// DESIGN-BUILD-117). Only a sheet as tall as what it holds (the medium and menu detents) gives up height that way: a
// sheet of fixed height would leave the room it gave up empty under its footer.

/** A row's place in the scroller, from the top of what it holds. */
export type RowBox = { top: number; height: number }

/** A cut showing this share of a row or less is a sliver, and this share or more reads as the row whole. */
const SLIVER = 1 / 3
const WHOLE = 2 / 3

/**
 * How far the cut (the body's foot, from the top of what it holds) comes up to fall across a row's middle: none when
 * it already shows that row's middle third, or the list ends above it. A sliver is taken back to the row above.
 */
export function peekTrim(cut: number, rows: readonly RowBox[]): number {
  const last = rows[rows.length - 1]
  if (!last || last.top + last.height <= cut) return 0
  let at = -1
  for (let n = 0; n < rows.length && rows[n].top < cut; n++) at = n
  if (at < 0) return 0
  const shown = (cut - rows[at].top) / rows[at].height
  if (shown >= SLIVER && shown <= WHOLE) return 0
  if (shown < SLIVER && at === 0) return 0
  const row = shown < SLIVER ? rows[at - 1] : rows[at]
  return Math.round(cut - (row.top + row.height / 2))
}

/**
 * A ref callback on a list in a sheet, its rows its children: it keeps the sheet's body (data-sheet-body) cut across
 * a row while the list runs past it, measured again as either changes size. A list in no sheet is left alone.
 */
export function peekRows(list: HTMLElement | null): (() => void) | undefined {
  const body = list?.closest<HTMLElement>("[data-sheet-body]")
  if (!list || !body) return undefined
  let frame = 0
  const fit = () => {
    frame = 0
    // Measured at the body's own height: a trim already made would hide where its cut falls.
    body.style.maxHeight = ""
    const detent = body.closest("[data-detent]")?.getAttribute("data-detent")
    const cut = body.clientHeight
    if ((detent !== "medium" && detent !== "menu") || body.scrollHeight <= cut + 1) return
    const top = body.getBoundingClientRect().top + body.clientTop - body.scrollTop
    const rows = Array.from(list.children, (row) => {
      const r = row.getBoundingClientRect()
      return { top: r.top - top, height: r.height }
    })
    const trim = peekTrim(cut, rows)
    // Never more than a third of the body: a body that short shows too little to peek.
    if (trim > 0 && trim < cut / 3) body.style.maxHeight = `${cut - trim}px`
  }
  // A frame later: a trim made while the observer reports would be a resize it reports again, in the same frame.
  const ask = () => {
    if (!frame) frame = requestAnimationFrame(fit)
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(ask) : null
  ro?.observe(body)
  ro?.observe(list)
  // A taller screen (the keyboard going) leaves a trimmed body's size as it was: the observer can't see that one.
  const screen = window.visualViewport ?? window
  screen.addEventListener("resize", ask)
  ask()
  return () => {
    cancelAnimationFrame(frame)
    ro?.disconnect()
    screen.removeEventListener("resize", ask)
    body.style.maxHeight = ""
  }
}
