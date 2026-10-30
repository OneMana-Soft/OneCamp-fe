/**
 * The board's bottom row on a computer, laid out by measure at every width
 * (DB-34's H8 M1: at 1280 the zoom cluster, wider by the map's button, ran
 * under the tool row's end). Its islands, left to right: the notes pill
 * (stickyTool), Excalidraw's tool row, and Excalidraw's zoom and undo cluster
 * in the corner, with the map's button and, open, the map over it. The
 * facilitation bar sits a band above the row, on the row's middle.
 *
 * Every island keeps GAP from the next, and EDGE from the board's sides:
 * - The row is on the board's middle while the pill beside it and the cluster
 *   both fit; else it moves off the middle only as far as it must.
 * - When the pill, the row and the cluster can't share the width, the cluster
 *   rises over the row's end. Narrower still, the pill rises over the row's
 *   other end. What rises shares one bottom line, the upper tier's: the
 *   facilitation bar's, or GAP over the row with no bar (DB-35).
 * - Where Excalidraw draws no cluster (its MobileMenu, on its own box under
 *   730 px, while the app keeps its computer chrome from 640), its tool row
 *   is where Excalidraw puts it, at the board's top, and only the pill is
 *   placed: beside the row's start, or with no room there by the row's start
 *   on the side towards the board's middle (under a row at the top), never
 *   off the board (CR-85).
 * - The facilitation bar keeps GAP from whatever rose into its band (the
 *   cluster, its open map, the pill), moving off the row's middle and, if it
 *   must, narrowing (it scrolls).
 *
 * The page publishes the places as CSS variables on its own element, so each
 * island moves in the same pass: excalidrawTheme.css reads the row's and the
 * cluster's, the pill and the facilitation bar read theirs.
 */
export const ROW_GAP = 8
export const ROW_EDGE = 12

/** A box on the board, its left and top from the board's own. */
export interface RowBox {
  left: number
  top: number
  width: number
  height: number
}

export interface BottomRowIn {
  /** The board's width and height. */
  width: number
  height: number
  /** The tool row as drawn: its left, width, top and height (the row is never moved up or down). */
  tools: { left: number; width: number; top: number; height: number }
  /** The zoom cluster where it sits on the row, not risen; null where Excalidraw draws none (its MobileMenu). */
  cluster: RowBox | null
  /** The open map where it sits with the cluster on the row; null when shut. */
  map: RowBox | null
  /** The notes pill's size; null with no pill (a viewer). */
  pill: { width: number; height: number } | null
  /** The facilitation bar: its width, and its top and height; null with no bar. */
  bar: { width: number; top: number; height: number } | null
  /** Excalidraw's phone footer (its MobileMenu's island at the foot): its top; none with the computer's rows. */
  foot?: { top: number } | null
}

export interface BottomRow {
  /** The tool row's middle. */
  centre: number
  /** How far the cluster (and its map) rises: 0 on the row. */
  lift: number
  /** The pill's place, beside the row or over its left end; null with no pill. */
  pill: { left: number; top: number; risen: boolean } | null
  /** The facilitation bar's middle, its widest, and how far it rises to stand GAP over Excalidraw's phone footer; null with no bar. */
  bar: { centre: number; max: number; lift: number } | null
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
/** The whole pixel in [lo, hi] nearest v, or v kept in it when no whole pixel is: rounding never takes from a gap. */
const fit = (v: number, lo: number, hi: number) => {
  const a = Math.ceil(lo)
  const b = Math.floor(hi)
  return a <= b ? clamp(Math.round(v), a, b) : clamp(v, lo, hi)
}

/** Where each island of the bottom row goes (see the module note). Pure. */
export function placeBottomRow(i: BottomRowIn): BottomRow {
  if (!i.cluster) return placeWithoutCluster(i)
  const half = i.tools.width / 2
  const beside = i.pill ? i.pill.width + ROW_GAP : 0
  // The row's middle: least with the pill at the left edge, most with the row's end GAP from the cluster.
  const least = ROW_EDGE + beside + half
  const most = i.cluster.left - ROW_GAP - half
  const oneRow = least <= most
  // Risen, the cluster leaves the row the board's whole width; the pill rises too when even that isn't enough.
  const pillRisen = !oneRow && least > i.width - ROW_EDGE - half
  const lo = pillRisen ? ROW_EDGE + half : least
  const hi = oneRow ? most : Math.max(lo, i.width - ROW_EDGE - half)
  const centre = fit(i.width / 2, lo, hi)
  // The upper tier's one bottom line: the bar's, or GAP over the row with no bar (never nearer the row than GAP).
  const tier = Math.min(i.tools.top - ROW_GAP, i.bar ? i.bar.top + i.bar.height : Infinity)
  const lift = oneRow ? 0 : Math.max(0, Math.ceil(i.cluster.top + i.cluster.height - tier))

  let pill: BottomRow["pill"] = null
  if (i.pill) {
    pill = pillRisen
      ? { left: Math.round(Math.max(ROW_EDGE, centre - half)), top: Math.floor(tier - i.pill.height), risen: true }
      : { left: Math.floor(centre - half - beside), top: Math.round(i.tools.top + (i.tools.height - i.pill.height) / 2), risen: false }
  }

  return { centre, lift, pill, bar: placeBar(i, centre, lift, pill) }
}

/** Excalidraw's MobileMenu: no cluster, and the row where Excalidraw draws it; the pill beside it or by its start. */
function placeWithoutCluster(i: BottomRowIn): BottomRow {
  const centre = i.tools.left + i.tools.width / 2
  let pill: BottomRow["pill"] = null
  if (i.pill) {
    const beside = i.tools.left - ROW_GAP - i.pill.width
    if (beside >= ROW_EDGE) pill = { left: Math.floor(beside), top: Math.round(i.tools.top + (i.tools.height - i.pill.height) / 2), risen: false }
    else {
      // Towards the board's middle: under a row at the top, over a row at the foot.
      const under = i.tools.top + i.tools.height / 2 < i.height / 2
      pill = {
        left: Math.round(clamp(i.tools.left, ROW_EDGE, Math.max(ROW_EDGE, i.width - ROW_EDGE - i.pill.width))),
        top: under ? Math.ceil(i.tools.top + i.tools.height + ROW_GAP) : Math.floor(i.tools.top - ROW_GAP - i.pill.height),
        risen: true,
      }
    }
  }
  return { centre, lift: 0, pill, bar: placeBar(i, centre, 0, pill) }
}

/** The facilitation bar: on the row's middle, kept GAP from whatever shares its band, narrowed if it must. */
function placeBar(i: BottomRowIn, centre: number, lift: number, pill: BottomRow["pill"]): BottomRow["bar"] {
  if (!i.bar) return null
  // Excalidraw's phone footer is taller than the computer's row: the bar rises as far as it must to stand GAP over it.
  const rise = i.foot ? Math.max(0, Math.ceil(i.bar.top + i.bar.height + ROW_GAP - i.foot.top)) : 0
  const top = i.bar.top - rise
  const bottom = top + i.bar.height
  // What shares the bar's band (GAP around it included) bounds it on that side.
  const meets = (b: { top: number; height: number }) => b.top < bottom + ROW_GAP && b.top + b.height > top - ROW_GAP
  let left = ROW_EDGE
  let right = i.width - ROW_EDGE
  for (const b of [i.cluster, i.map]) {
    if (b && meets({ top: b.top - lift, height: b.height })) right = Math.min(right, b.left - ROW_GAP)
  }
  if (pill && i.pill && meets({ top: pill.top, height: i.pill.height })) left = Math.max(left, pill.left + i.pill.width + ROW_GAP)
  const max = Math.max(0, Math.floor(right - left))
  const w = Math.min(i.bar.width, max)
  return { centre: fit(centre, left + w / 2, right - w / 2), max, lift: rise }
}
