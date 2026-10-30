import { describe, expect, it } from "vitest"
import { ROW_EDGE, ROW_GAP, placeBottomRow, type BottomRowIn } from "./bottomRow"

// The board's bottom row on a computer (DB-34's H8 M1): the pill, Excalidraw's
// tool row and its zoom cluster keep ROW_GAP apart at every width, and the
// facilitation bar keeps it from whatever rises into its band. The sizes are
// the board's own at 1280 (h8g): a 550 px tool row, a 103 px pill and a 225 px
// cluster with the map's button, 16 px in from the board's right.

const TOOLS = { width: 550, top: 792, height: 44 }
const PILL = { width: 103, height: 40 }
const BAR = { width: 251, top: 736, height: 44 }
const MAP = { width: 216, height: 150 }

/** The board `width` wide, its cluster `cluster` wide in the corner; the map open when `map`. */
function board(width: number, o: { cluster?: number; map?: boolean; pill?: boolean; bar?: boolean; tools?: number } = {}): BottomRowIn {
  const cw = o.cluster ?? 225
  const cluster = { left: width - 16 - cw, top: 798, width: cw, height: 36 }
  return {
    width,
    height: 852,
    tools: { ...TOOLS, left: (width - (o.tools ?? TOOLS.width)) / 2, width: o.tools ?? TOOLS.width },
    cluster,
    map: o.map ? { left: cluster.left + cw - MAP.width + 2, top: cluster.top - 12 - MAP.height, ...MAP } : null,
    pill: o.pill === false ? null : PILL,
    bar: o.bar === false ? null : BAR,
  }
}

/** The row's left and right ends. */
const ends = (i: BottomRowIn, centre: number) => [centre - i.tools.width / 2, centre + i.tools.width / 2] as const

describe("placeBottomRow", () => {
  it("on a wide board keeps the row on the middle, the pill beside it, the cluster on the row and the bar over it", () => {
    const i = board(1192)
    const r = placeBottomRow(i)
    expect(r.centre).toBe(596)
    expect(r.lift).toBe(0)
    const [left] = ends(i, r.centre)
    expect(r.pill).toEqual({ left: left - ROW_GAP - PILL.width, top: 794, risen: false })
    expect(r.bar).toEqual({ centre: 596, max: 1192 - 2 * ROW_EDGE, lift: 0 })
  })

  it("at 1280 with the sidebar open (1024 wide) moves the row off the middle only as far as the cluster needs", () => {
    const i = board(1024)
    const r = placeBottomRow(i)
    expect(r.lift).toBe(0)
    const [left, right] = ends(i, r.centre)
    // It was on the middle (512), and its end ran under the cluster's start.
    expect(r.centre).toBeLessThan(512)
    expect(i.cluster!.left - right).toBe(ROW_GAP)
    expect(left - (r.pill!.left + PILL.width)).toBe(ROW_GAP)
    // The bar stays on the row's middle: the cluster isn't in its band.
    expect(r.bar!.centre).toBe(r.centre)
  })

  it("at 1024 with the sidebar open (768 wide) raises the cluster over the row's end, and the bar keeps clear of it", () => {
    const i = board(768)
    const r = placeBottomRow(i)
    // The pill, the row and the cluster need 12 + 103 + 8 + 550 + 8 + 225 + 16: more than 768.
    expect(r.lift).toBeGreaterThan(0)
    // Risen, the cluster shares the bar's bottom line, the upper tier's one bottom (DB-35), 12 px over the row.
    expect(i.cluster!.top + i.cluster!.height - r.lift).toBe(BAR.top + BAR.height)
    // The row keeps the pill beside it, the pill at the board's edge, and the row inside the board.
    expect(r.pill).toEqual({ left: ROW_EDGE, top: 794, risen: false })
    const [left, right] = ends(i, r.centre)
    expect(left - (ROW_EDGE + PILL.width)).toBe(ROW_GAP)
    expect(right).toBeLessThanOrEqual(768 - ROW_EDGE)
    // The risen cluster shares the bar's band: the bar ends 8 px or more before it.
    expect(r.bar!.centre + BAR.width / 2).toBeLessThanOrEqual(i.cluster!.left - ROW_GAP)
    expect(r.bar!.max).toBe(i.cluster!.left - ROW_GAP - ROW_EDGE)
  })

  it("keeps the bar clear of the open map too, risen with its cluster", () => {
    const i = board(768, { map: true })
    const r = placeBottomRow(i)
    const map = i.map!
    expect(r.bar!.centre + BAR.width / 2).toBeLessThanOrEqual(Math.min(i.cluster!.left, map.left) - ROW_GAP)
    // A bar as wide as the board narrows to the room left of them.
    const wide = placeBottomRow({ ...i, bar: { ...BAR, width: 900 } })
    expect(wide.bar!.max).toBe(Math.min(i.cluster!.left, map.left) - ROW_GAP - ROW_EDGE)
    expect(wide.bar!.centre - wide.bar!.max / 2).toBeGreaterThanOrEqual(ROW_EDGE)
  })

  it("on a wide board leaves the bar on the row's middle with the map open: the map is beside it, not in its way", () => {
    const i = board(1192, { map: true })
    expect(placeBottomRow(i).bar!.centre).toBe(596)
  })

  it("narrower still, raises the pill over the row's other end, and the bar keeps clear of both", () => {
    const i = board(600)
    const r = placeBottomRow(i)
    expect(r.lift).toBeGreaterThan(0)
    const [left, right] = ends(i, r.centre)
    expect(left).toBeGreaterThanOrEqual(ROW_EDGE)
    expect(right).toBeLessThanOrEqual(600 - ROW_EDGE)
    // Risen, the pill shares the upper tier's bottom line too: the bar's.
    expect(r.pill).toEqual({ left: Math.round(left), top: BAR.top + BAR.height - PILL.height, risen: true })
    const bar = r.bar!
    const w = Math.min(BAR.width, bar.max)
    expect(bar.centre - w / 2).toBeGreaterThanOrEqual(r.pill!.left + PILL.width + ROW_GAP)
    expect(bar.centre + w / 2).toBeLessThanOrEqual(i.cluster!.left - ROW_GAP)
  })

  it("lays out a viewer's row (no pill, no bar) by the same rules: the middle, off it for the cluster, the cluster risen", () => {
    expect(placeBottomRow(board(1192, { pill: false, bar: false }))).toEqual({ centre: 596, lift: 0, pill: null, bar: null })
    const level = placeBottomRow(board(1024, { pill: false, bar: false }))
    expect(level).toEqual({ centre: 500, lift: 0, pill: null, bar: null })
    expect(1024 - 16 - 225 - (level.centre + 275)).toBe(ROW_GAP)
    const narrow = placeBottomRow(board(768, { pill: false, bar: false, cluster: 195 }))
    expect(narrow.centre).toBe(384)
    expect(narrow.lift).toBeGreaterThan(0)
    // With no bar, the risen cluster's bottom is 8 px over the row.
    expect(798 + 36 - narrow.lift).toBe(TOOLS.top - ROW_GAP)
  })

  it("never rounds a gap below 8 px: a row of a fractional width keeps its ends whole pixels or more away", () => {
    const i = board(1024, { tools: 549.6 })
    const r = placeBottomRow(i)
    const [left, right] = ends(i, r.centre)
    expect(i.cluster!.left - right).toBeGreaterThanOrEqual(ROW_GAP)
    expect(left - (r.pill!.left + PILL.width)).toBeGreaterThanOrEqual(ROW_GAP)
  })

  // Excalidraw switches to its MobileMenu on its own box (under 730 px wide, or under 500 tall and 1000 wide) while
  // the app keeps its computer chrome from 640 px: its tool row is then at the board's top, with no zoom cluster
  // (CR-85, H8 M1: the pill was never placed there, so it stayed hidden). The same rule places it.
  describe("with no zoom cluster (Excalidraw's MobileMenu)", () => {
    const top = (width: number, left: number, o: { bar?: boolean; height?: number; rowTop?: number } = {}): BottomRowIn => ({
      width,
      height: o.height ?? 812,
      tools: { left, top: o.rowTop ?? 64, width: 360, height: 44 },
      cluster: null,
      map: null,
      pill: PILL,
      bar: o.bar === false ? null : { ...BAR, top: (o.height ?? 812) - 72 - BAR.height },
    })

    it("keeps the row where Excalidraw draws it, and the pill beside its start", () => {
      const r = placeBottomRow(top(704, 172))
      expect(r.centre).toBe(352)
      expect(r.lift).toBe(0)
      expect(r.pill).toEqual({ left: 172 - ROW_GAP - PILL.width, top: 66, risen: false })
      // The bar, far below the row, stays on the row's middle.
      expect(r.bar!.centre).toBe(352)
    })

    it("with no room beside the row's start, puts the pill under it, never above a row at the board's top", () => {
      const r = placeBottomRow(top(444, 42))
      expect(r.pill).toEqual({ left: 42, top: 64 + 44 + ROW_GAP, risen: true })
    })

    it("with a row at the board's foot (a board under 500 px tall), puts the pill over it", () => {
      const r = placeBottomRow(top(900, 42, { height: 480, rowTop: 420, bar: false }))
      expect(r.pill).toEqual({ left: 42, top: 420 - ROW_GAP - PILL.height, risen: true })
    })

    it("raises the bar to stand 8 px over Excalidraw's phone footer, which is taller than the computer's row", () => {
      // The bar rests 72 px over the board's foot (812 - 72 = 740), the footer's island tops out 74 px over it (738).
      const r = placeBottomRow({ ...top(704, 172), foot: { top: 738 } })
      expect(r.bar!.lift).toBe(740 + ROW_GAP - 738)
      // Where it already stands clear, it stays.
      expect(placeBottomRow({ ...top(704, 172), foot: { top: 760 } }).bar!.lift).toBe(0)
      expect(placeBottomRow(top(704, 172)).bar!.lift).toBe(0)
    })

    it("never puts the pill off the board's edge", () => {
      const r = placeBottomRow(top(300, 4))
      expect(r.pill!.left).toBeGreaterThanOrEqual(ROW_EDGE)
      expect(r.pill!.left + PILL.width).toBeLessThanOrEqual(300 - ROW_EDGE)
    })
  })
})
