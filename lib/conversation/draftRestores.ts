import { createSlice } from "@reduxjs/toolkit"

/**
 * How many times a kept draft has been put in each thread's reply box (the
 * Draft Store, lib/conversation/draftSync), by draft key. The box hands it to
 * its editor as contentRevision, so a kept draft shows even while the box
 * has focus. A slice of the chat module, added by the Draft Store when it
 * starts (store/lazySlices): no page's first load carries it.
 */
export type DraftRestoresState = Record<string, number>

export const draftRestoresSlice = createSlice({
  name: "draftRestores",
  initialState: {} as DraftRestoresState,
  reducers: {
    draftRestored: (state, action: { payload: string }) => {
      state[action.payload] = (state[action.payload] ?? 0) + 1
    },
  },
})

export const { draftRestored } = draftRestoresSlice.actions

declare module "@/store/lazySlices" {
  interface LazySlices {
    draftRestores: DraftRestoresState
  }
}
