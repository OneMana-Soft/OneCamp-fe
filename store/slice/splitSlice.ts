import { createSlice, current } from "@reduxjs/toolkit"
import { MAIN, MAIN_KEY, MAX_PANES, isCallPane, keyOf, paneKey, same, type Pane } from "@/lib/split"
import { moveTo, swapIn, viewRow, withPane } from "@/lib/splitLayout"
import { closeSplit, evenOut, moveView, openInSplit, replacePane, restoreSplit, setActive, setFocused, setHere, setRoom, setSizes, setSplitOn, swapViews, type SplitLayout } from "@/store/slice/splitActions"

/** A change with an Undo: a move, a swap, a pane closed for room. */
export type SplitChange = { n: number; what: "move" | "swap" | "room"; key: string; other?: string; pane?: Pane; quiet?: boolean; before: SplitLayout }

const initialState = {
  panes: [] as Pane[],
  order: [] as string[], // view keys, left to right
  active: MAIN,
  focused: null as number | null,
  on: true,
  room: MAX_PANES, // side views the width holds (W)
  here: null as Pane | null, // the page's own item
  used: [] as string[], // view keys, latest first (L)
  sizes: {} as Record<string, number>, // widths by view key (S)
  evened: 0,
  change: null as SplitChange | null,
  pulse: null as { key: string; n: number } | null, // a view opened again, to point at
}
export type SplitState = typeof initialState
type State = SplitState

// Added by the shell (hooks/useSplitView), not the store every page reaches.
declare module "@/store/lazySlices" {
  interface LazySlices {
    split: SplitState
  }
}

const layoutOf = (s: State): SplitLayout => {
  const { panes, order, sizes, active, focused } = current(s)
  return { panes, order, sizes, active, focused }
}

/** The order written out whole, so a new view goes on its end. */
const tidy = (s: State) => {
  s.order = viewRow(s.panes, s.order).map((v) => keyOf(s.panes, v))
}

const use = (s: State, view: number) => {
  const k = keyOf(s.panes, view)
  if (s.used[0] !== k) s.used = [k, ...s.used.filter((x) => x !== k)]
}

/** Takes pane `i` out; its keys go to the latest view left. */
function remove(s: State, i: number) {
  const k = paneKey(s.panes[i])
  s.panes.splice(i, 1)
  s.order = s.order.filter((x) => x !== k)
  s.used = s.used.filter((x) => x !== k)
  const shift = (v: number) => (v > i ? v - 1 : v)
  const recent = s.used.map((u) => (u === MAIN_KEY ? MAIN : s.panes.findIndex((p) => paneKey(p) === u))).find((v) => v === MAIN || v >= 0)
  s.active = s.active === i ? (recent ?? MAIN) : shift(s.active)
  s.focused = s.focused === null || s.focused === i ? null : shift(s.focused)
}

function replace(s: State, i: number, p: Pane) {
  const was = paneKey(s.panes[i])
  const k = paneKey(p)
  s.panes[i] = p
  s.order = s.order.map((x) => (x === was ? k : x))
  s.used = s.used.map((x) => (x === was ? k : x))
}

const changed = (s: State, c: Omit<SplitChange, "n">) => {
  s.change = { ...c, n: (s.change?.n ?? 0) + 1 }
}

/**
 * Split view: panes in the order they opened (their index), `order` where
 * views sit, the active and focused views, and `on`, the shell's switch:
 * off, opens do nothing. Actions: store/slice/splitActions.
 */
const splitSlice = createSlice({
  name: "split",
  initialState,
  reducers: {},
  extraReducers: (cases) => {
    // Open already (beside or as the page, unless pinned): it comes forward.
    cases.addCase(openInSplit, (s, { payload }) => {
      if (!s.on) return
      const p: Pane = { kind: payload.kind, id: payload.id }
      const at = s.panes.findIndex((x) => same(x, p))
      if (at >= 0 || (!payload.pin && s.here && same(s.here, p))) {
        const v = at >= 0 ? at : MAIN
        s.active = v
        s.focused = null
        use(s, v)
        s.pulse = { key: keyOf(s.panes, v), n: (s.pulse?.n ?? 0) + 1 }
        return
      }
      const before = layoutOf(s)
      tidy(s)
      const kept = withPane(s.panes, p, Math.max(1, Math.min(s.room, MAX_PANES)), s.used)
      const gone = s.panes.filter((x) => !kept.some((y) => same(x, y)))
      for (const g of gone) remove(s, s.panes.findIndex((x) => same(x, g)))
      s.panes.push(p)
      s.order.push(paneKey(p))
      s.active = s.panes.length - 1
      s.focused = null
      use(s, s.active)
      const closed = gone.find((g) => !isCallPane(g))
      if (closed) changed(s, { what: "room", key: paneKey(closed), pane: closed, before })
    })
    cases.addCase(closeSplit, (s, { payload }) => {
      if (payload >= 0 && payload < s.panes.length) remove(s, payload)
    })
    cases.addCase(replacePane, (s, { payload }) => {
      if (s.panes[payload.index]) replace(s, payload.index, payload.pane)
    })
    cases.addCase(restoreSplit, (s, { payload }) => {
      const { panes, order = [], sizes, active = MAIN, focused = null } = payload
      s.panes = panes.filter((p) => !(s.here && same(s.here, p)))
      s.order = order
      tidy(s)
      if (sizes) s.sizes = sizes
      s.active = active >= 0 && active < s.panes.length ? active : MAIN
      s.focused = focused !== null && focused < s.panes.length ? focused : null
      s.used = s.used.filter((k) => s.order.includes(k))
    })
    cases.addCase(setActive, (s, { payload: v }) => {
      if (v !== MAIN && !(v >= 0 && v < s.panes.length)) return
      s.active = v
      use(s, v)
    })
    cases.addCase(setFocused, (s, { payload: v }) => {
      s.focused = v === null || v === MAIN || (v >= 0 && v < s.panes.length) ? v : null
    })
    cases.addCase(setSplitOn, (s, { payload }) => {
      s.on = payload
    })
    cases.addCase(setRoom, (s, { payload }) => {
      s.room = payload
    })
    // The page shows `here`; open beside too, the pane takes the page left (or closes).
    cases.addCase(setHere, (s, { payload: p }) => {
      const prev = s.here
      s.here = p
      const at = p ? s.panes.findIndex((x) => same(x, p)) : -1
      if (!p || at < 0) return
      if (prev && !isCallPane(prev) && !isCallPane(p) && !s.panes.some((x) => same(x, prev))) replace(s, at, prev)
      else remove(s, at)
    })
    cases.addCase(moveView, (s, { payload }) => {
      const { view, by = 0, quiet } = payload
      const row = viewRow(s.panes, s.order)
      const from = row.indexOf(view)
      const to = payload.to ?? from + by
      if (from < 0 || to < 0 || to >= row.length || to === from) return
      const before = layoutOf(s)
      s.order = moveTo(s.panes, s.order, view, to)
      changed(s, { what: "move", key: keyOf(s.panes, view), quiet, before })
    })
    cases.addCase(swapViews, (s, { payload: { a, b, quiet } }) => {
      const row = viewRow(s.panes, s.order)
      if (a === b || !row.includes(a) || !row.includes(b)) return
      const before = layoutOf(s)
      s.order = swapIn(s.panes, s.order, a, b)
      changed(s, { what: "swap", key: keyOf(s.panes, a), other: keyOf(s.panes, b), quiet, before })
    })
    cases.addCase(setSizes, (s, { payload }) => {
      Object.assign(s.sizes, payload)
    })
    cases.addCase(evenOut, (s) => {
      for (const k of [MAIN_KEY, ...s.panes.map(paneKey)]) s.sizes[k] = 1
      s.evened++
    })
  },
})

export default splitSlice
