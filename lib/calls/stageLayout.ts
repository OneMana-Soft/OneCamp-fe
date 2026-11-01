// Stage Layout (A4, #54; meet-17, meet-14 and zoom-03): what the call's stage
// draws, from who is in the call, what is presented, your pin, the spotlight
// and who speaks: what is in focus, the grid's page, and the strip beside the
// focus with "+N" for whoever doesn't fit. Pure, so the call draws it and the
// recording draws the same (S4).
//
// - The grid: the columns and rows that draw everyone biggest at 16:9, up to
//   7x7 while a tile stays at least 160x90; past that, pages.
// - The focus: your pin, else what is presented (the board alone when it went
//   up last, else every share together, oldest first: the newest four, or a
//   phone's newest one), else the spotlight, else whoever speaks, else the
//   first tile. A presentation that begins clears your pin
//   (presentationOrder), so it takes the stage from it.
// - The strip: whoever fits beside the focus, then "+N". A narrow stage (a
//   phone's) holds one share in focus and three people and "+N" in its strip,
//   in square places, and gives a board the whole stage. A share in focus
//   there takes the stage's width, the strip a row under it, wherever that
//   draws the share bigger (V-233: beside the strip a 366 px stage drew a
//   slide 254 px wide).

/** Something on the stage: a person's camera or shared screen (`identity|source`, a tile's data-flip-key), or the board (`board:uuid`). */
export type StageKey = string
/** Everyone in a grid, or one thing big with the rest in a strip. */
export type StageMode = "grid" | "speaker"
export type Size = { w: number; h: number }

/** The space between tiles, px (the stage's gap-2). */
export const STAGE_GAP = 8
/** The smallest tile the grid draws: past it, the grid goes on to another page. */
export const MIN_TILE: Size = { w: 160, h: 90 }
/** The most columns, or rows, the grid draws: 7x7, so 49 to a page. */
export const MAX_SIDE = 7
/** A stage narrower than this is a phone's: one share in focus, a narrow strip of three and "+N". */
export const NARROW_BELOW = 600
/** The strip's width, on a narrow stage and a wide one. */
export const STRIP_W = { narrow: 104, wide: 200 } as const
/** The most places in a narrow strip: three people and "+N", or four people when they are all. */
export const NARROW_STRIP_PLACES = 4
/** The most shares in focus together, the newest; the rest wait in the strip. */
export const MAX_SHARES = { narrow: 1, wide: 4 } as const
/** The pager's row under a grid of several pages: its buttons take a finger (44 px). */
export const PAGER_H = 44

export type StageInput = {
  /** Everyone's camera tile, in the call's order. */
  tiles: StageKey[]
  /** What is presented, every shared screen and the board, in the order each began (presentationOrder). */
  presenting: StageKey[]
  /** Which of `presenting` is the board, while one is up. */
  board?: StageKey | null
  /** What you pinned for yourself. A presentation that begins clears it (presentationOrder's `began`). */
  pin?: StageKey | null
  /** Whom the people running the call put in the spotlight: everyone's pin (Call Control). */
  spotlight?: StageKey | null
  /** Who speaks now. */
  speaker?: StageKey | null
  mode: StageMode
  /** The stage's room for tiles, px. */
  viewport: Size
  /** The grid's page, from 0: one past the last shows the last. */
  page?: number
}

export type StageLayout = {
  /** What the stage shows big, `cols` by `rows` (every share together, else one thing); empty in the grid. */
  focus: { keys: StageKey[]; cols: number; rows: number; tile: Size }
  /** Everyone, a page at a time; null while something is in focus. */
  grid: { keys: StageKey[]; cols: number; rows: number; tile: Size; page: number; pages: number } | null
  /**
   * Beside the focus, `w` px wide, or under it (`below`) across the stage's `w` and `tile.h` tall: whoever fits in places
   * of `tile`, then "+N" (`more`) for the rest.
   */
  strip: { keys: StageKey[]; more: number; w: number; tile: Size; below: boolean }
}

/** A person's camera or shared screen on the stage, as their tile's data-flip-key. */
export const stageKey = (identity: string, source: string): StageKey => `${identity}|${source}`
/** The board on the stage. */
export const boardKey = (uuid: string): StageKey => `board:${uuid}`

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
/** Whole pixels, so a size that is 160 on paper never floors to 159. */
const px = (n: number) => Math.floor(n + 1e-6)
/**
 * A place in the strip: a phone's are square, so a face (56 px at the least) clears its name plate in 104 px
 * (DESIGN-BUILD-54: 104x58 cut the face and put the plate over it); a wide stage's are 16:9.
 */
const stripTile = (w: number, narrow: boolean): Size => ({ w, h: narrow ? w : px((w * 9) / 16) })

/**
 * How `n` 16:9 tiles sit best in `room`: the columns and rows that draw them
 * biggest, no more than `max` either way and no tile under `min`; `per` is
 * how many a page holds. Of two that draw them as big, the one with fewer
 * empty places wins. Pure.
 */
export function fitTiles(
  n: number,
  room: Size,
  { min = { w: 0, h: 0 }, max = MAX_SIDE, gap = STAGE_GAP }: { min?: Size; max?: number; gap?: number } = {},
): { cols: number; rows: number; tile: Size; per: number } {
  const w = Math.max(0, room.w)
  const h = Math.max(0, room.h)
  const across = (space: number, tile: number) => (tile + gap > 0 ? clamp(px((space + gap) / (tile + gap)), 1, max) : max)
  const maxCols = across(w, min.w)
  const maxRows = across(h, min.h)
  const per = maxCols * maxRows
  const count = clamp(n, 1, per)
  let best = { cols: 1, rows: 1, size: -Infinity }
  for (let cols = 1; cols <= Math.min(maxCols, count); cols++) {
    const rows = Math.ceil(count / cols)
    if (rows > maxRows) continue
    const size = Math.min((w - (cols - 1) * gap) / cols, ((h - (rows - 1) * gap) * 16) / (rows * 9))
    const bigger = size > best.size + 0.5
    const asBig = Math.abs(size - best.size) <= 0.5 && cols * rows < best.cols * best.rows
    if (bigger || asBig) best = { cols, rows, size }
  }
  const tw = Math.max(0, best.size)
  return { cols: best.cols, rows: best.rows, tile: { w: px(tw), h: px((tw * 9) / 16) }, per }
}

/**
 * What is presented, in the order each began: what's still on keeps its
 * place, and what begins joins the end. `began` says something did, which
 * takes the stage from your pin; an unchanged list comes back as it was. Pure.
 */
export function presentationOrder(prev: StageKey[], now: StageKey[]): { order: StageKey[]; began: boolean } {
  const on = new Set(now)
  const order = prev.filter((k) => on.has(k))
  const kept = new Set(order)
  const fresh = now.filter((k) => !kept.has(k))
  if (fresh.length === 0) return { order: order.length === prev.length ? prev : order, began: false }
  return { order: [...order, ...fresh], began: true }
}

/** What the stage draws. Pure. */
export function stageLayout(i: StageInput): StageLayout {
  const all = [...new Set([...i.presenting, ...i.tiles])]
  const here = new Set(all)
  const has = (k?: StageKey | null): k is StageKey => !!k && here.has(k)
  const narrow = i.viewport.w < NARROW_BELOW

  if (i.mode === "grid") {
    let fit = fitTiles(all.length, i.viewport, { min: MIN_TILE })
    // Pages take a row for the pager under the grid.
    if (all.length > fit.per) fit = fitTiles(all.length, { w: i.viewport.w, h: i.viewport.h - PAGER_H - STAGE_GAP }, { min: MIN_TILE })
    const pages = Math.max(1, Math.ceil(all.length / fit.per))
    const page = clamp(Math.floor(i.page ?? 0), 0, pages - 1)
    return {
      focus: { keys: [], cols: 1, rows: 1, tile: { w: 0, h: 0 } },
      grid: { keys: all.slice(page * fit.per, (page + 1) * fit.per), cols: fit.cols, rows: fit.rows, tile: fit.tile, page, pages },
      strip: { keys: [], more: 0, w: narrow ? STRIP_W.narrow : STRIP_W.wide, tile: stripTile(narrow ? STRIP_W.narrow : STRIP_W.wide, narrow), below: false },
    }
  }

  const board = has(i.board) ? i.board : null
  const focus = ((): StageKey[] => {
    if (has(i.pin)) return [i.pin]
    const newest = i.presenting[i.presenting.length - 1]
    if (newest !== undefined) {
      if (newest === board) return [newest]
      return i.presenting.filter((k) => k !== board).slice(-(narrow ? MAX_SHARES.narrow : MAX_SHARES.wide))
    }
    for (const k of [i.spotlight, i.speaker]) if (has(k)) return [k]
    return all.slice(0, 1)
  })()

  const shown = new Set(focus)
  const others = all.filter((k) => !shown.has(k))
  const w = narrow ? STRIP_W.narrow : STRIP_W.wide
  // A board on a phone's stage takes all of it; the people are in People.
  const aside = narrow && focus.length === 1 && focus[0] === board
  // Whoever fits in `places`, then "+N" for the rest (never a "+1").
  const fill = (places: number) =>
    others.length <= places ? { keys: others, more: 0 } : { keys: others.slice(0, places - 1), more: others.length - (places - 1) }
  const tile = stripTile(w, narrow)
  const fits = Math.max(1, px((i.viewport.h + STAGE_GAP) / (tile.h + STAGE_GAP)))
  const beside = aside ? { keys: [], more: 0 } : fill(narrow ? Math.min(NARROW_STRIP_PLACES, fits) : fits)
  const besideIt = beside.keys.length > 0 || beside.more > 0 ? w + STAGE_GAP : 0
  const fit = fitTiles(focus.length, { w: i.viewport.w - besideIt, h: i.viewport.h }, { max: MAX_SHARES.wide })

  // A shared screen on a phone's stage: the strip goes under it, a row of the strip's four places (three people and
  // "+N", or four when they are all), squares as wide as the row allows, wherever that draws the share bigger than
  // beside the strip (V-233). A share beginning so moves no one out of the strip. A person in focus keeps the strip
  // beside them (DESIGN-BUILD-54), and a board has the whole stage.
  if (besideIt > 0 && narrow && focus.every((k) => k !== board && i.presenting.includes(k))) {
    const side = px((i.viewport.w - (NARROW_STRIP_PLACES - 1) * STAGE_GAP) / NARROW_STRIP_PLACES)
    const under = fitTiles(focus.length, { w: i.viewport.w, h: i.viewport.h - side - STAGE_GAP }, { max: MAX_SHARES.wide })
    if (under.tile.w > fit.tile.w) {
      const strip = { ...fill(NARROW_STRIP_PLACES), w: px(i.viewport.w), tile: { w: side, h: side }, below: true }
      return { focus: { keys: focus, cols: under.cols, rows: under.rows, tile: under.tile }, grid: null, strip }
    }
  }
  return { focus: { keys: focus, cols: fit.cols, rows: fit.rows, tile: fit.tile }, grid: null, strip: { ...beside, w, tile, below: false } }
}
