import { createAction } from "@reduxjs/toolkit"
import type { Pane } from "@/lib/split"

// Split view's actions, apart from its slice (the shell's): a page that only
// opens something beside reaches these lines alone.

export type SplitLayout = { panes: Pane[]; order: string[]; sizes: Record<string, number>; active: number; focused: number | null }

const act = <P = void>(type: string) => createAction<P>(`split/${type}`)

/** `pin`: the page itself, beside (Ctrl+Alt+\\). */
export const openInSplit = act<Pane & { pin?: boolean }>("openInSplit")
export const closeSplit = act<number>("closeSplit")
export const replacePane = act<{ index: number; pane: Pane }>("replacePane")
export const restoreSplit = act<Partial<SplitLayout> & { panes: Pane[] }>("restoreSplit")
export const setActive = act<number>("setActive")
export const setFocused = act<number | null>("setFocused")
export const setSplitOn = act<boolean>("setSplitOn")
export const setRoom = act<number>("setRoom")
export const setHere = act<Pane | null>("setHere")
export const moveView = act<{ view: number; by?: number; to?: number; quiet?: boolean }>("moveView")
export const swapViews = act<{ a: number; b: number; quiet?: boolean }>("swapViews")
export const setSizes = act<Record<string, number>>("setSizes")
export const evenOut = act("evenOut")

/** Whether views sit side by side here (the shell's switch). */
export const selectSplitOn = (s: { split?: { on: boolean } }) => s.split?.on !== false
