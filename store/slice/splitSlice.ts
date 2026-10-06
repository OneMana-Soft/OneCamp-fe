import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { MAIN, withPane, type Pane } from "@/lib/split"

/**
 * Split view (lib/split): the panes beside the main page, which view is
 * active (MAIN or a pane's index; shortcuts act on it), and which, if any, is
 * focused (shown alone).
 */
const splitSlice = createSlice({
  name: "split",
  initialState: { panes: [] as Pane[], active: MAIN, focused: null as number | null },
  reducers: {
    openInSplit: (state, action: PayloadAction<Pane>) => {
      state.panes = withPane(state.panes, action.payload)
      state.active = state.panes.findIndex((p) => p.kind === action.payload.kind && p.id === action.payload.id)
      state.focused = null
    },
    closeSplit: (state, action: PayloadAction<number>) => {
      const i = action.payload
      if (i < 0 || i >= state.panes.length) return
      state.panes.splice(i, 1)
      const shift = (v: number) => (v === i ? MAIN : v > i ? v - 1 : v)
      state.active = shift(state.active)
      state.focused = state.focused === null || state.focused === i ? null : shift(state.focused)
    },
    replacePane: (state, action: PayloadAction<{ index: number; pane: Pane }>) => {
      if (state.panes[action.payload.index]) state.panes[action.payload.index] = action.payload.pane
    },
    setSplit: (state, action: PayloadAction<Pane[]>) => {
      state.panes = action.payload
      state.active = MAIN
      state.focused = null
    },
    setActive: (state, action: PayloadAction<number>) => {
      const v = action.payload
      if (v === MAIN || (v >= 0 && v < state.panes.length)) state.active = v
    },
    setFocused: (state, action: PayloadAction<number | null>) => {
      const v = action.payload
      state.focused = v === null || v === MAIN || (v >= 0 && v < state.panes.length) ? v : null
    },
  },
})

export const { openInSplit, closeSplit, replacePane, setSplit, setActive, setFocused } = splitSlice.actions
export default splitSlice
