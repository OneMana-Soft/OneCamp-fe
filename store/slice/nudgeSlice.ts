import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import type { Nudge } from "@/services/nudgeService"

// nudgeSlice holds the current user's open proactive nudges plus their open
// count. State is fed from BOTH the REST list (InboxNudges) and live MQTT
// events (lib/ai/nudgeMessage: a new nudge, or one cleared by its id), and
// reads are transport-agnostic. The Inbox badge is the server's count, which
// counts the urgent ones by its one rule (V-577); nothing here adds to it.

interface NudgeState {
    nudges: Nudge[]
    openCount: number
    // Whether the initial REST hydration has happened: before it, the Inbox's
    // group draws nothing (components/ai/InboxNudges).
    hydrated: boolean
}

const initialState: NudgeState = {
    nudges: [],
    openCount: 0,
    hydrated: false,
}

const nudgeSlice = createSlice({
    name: "nudge",
    initialState,
    reducers: {
        // Full replace from the REST list endpoint.
        setNudges: (state, action: PayloadAction<{ nudges: Nudge[]; openCount: number }>) => {
            // Defensive: never store a non-array (a null list would crash every
            // `nudges.length`/`nudges.map` read in the globally-mounted bell).
            const next = Array.isArray(action.payload.nudges) ? action.payload.nudges : []
            state.nudges = next.map((n) => keepDot(state.nudges, n))
            state.openCount = action.payload.openCount || 0
            state.hydrated = true
        },
        // A live "new nudge" arrived over MQTT. Dedup by id (the engine may
        // refresh-and-republish the same nudge), newest/highest-priority first.
        upsertNudge: (state, action: PayloadAction<Nudge>) => {
            const n = keepDot(state.nudges, action.payload)
            const idx = state.nudges.findIndex((x) => x.id === n.id)
            if (idx >= 0) {
                state.nudges[idx] = n
            } else {
                state.nudges.unshift(n)
            }
            // Keep priority-desc then newest ordering stable.
            state.nudges.sort((a, b) =>
                b.priority - a.priority ||
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
        },
        // Authoritative open-count from the server (e.g. after a supersede pass
        // or another tab dismissing). Trust it over local length.
        setOpenCount: (state, action: PayloadAction<number>) => {
            state.openCount = action.payload
            // If the server says 0, our local list is stale-cleared too.
            if (action.payload === 0) {
                state.nudges = []
            }
        },
        // Optimistic local removal on dismiss/act. Decrement the count rather
        // than tie it to list length: the list is capped (e.g. 50) while the
        // true open count can be higher, so `count = length` would under-count
        // for users with many open nudges.
        removeNudge: (state, action: PayloadAction<string>) => {
            const before = state.nudges.length
            state.nudges = state.nudges.filter((n) => n.id !== action.payload)
            if (state.nudges.length < before) {
                state.openCount = Math.max(0, state.openCount - 1)
            }
        },
        clearAllNudges: (state) => {
            state.nudges = []
            state.openCount = 0
        },
        // Nudges closed (resolved, superseded, or dismissed elsewhere), told
        // by their ids: those go and no other, at the server's open count
        // (none open: none listed).
        nudgesCleared: (state, action: PayloadAction<{ ids: readonly string[]; openCount?: number }>) => {
            const before = state.nudges.length
            const closed = new Set(action.payload.ids)
            state.nudges = state.nudges.filter((n) => !closed.has(n.id))
            const { openCount } = action.payload
            state.openCount = openCount ?? Math.max(0, state.openCount - (before - state.nudges.length))
            if (openCount === 0) state.nudges = []
        },
        // Opened: its dot goes, as a feed row's does. It stays listed.
        nudgeOpened: (state, action: PayloadAction<string>) => {
            const n = state.nudges.find((x) => x.id === action.payload)
            if (n) n.unread = false
        },
    },
})

/**
 * n, with the dot it had here. Opening the Inbox moves the last look, so a
 * read after it marks nothing unread; what the badge counted keeps its dot
 * until it is opened, as the feed's rows do (lib/activity/readState).
 */
function keepDot(had: readonly Nudge[], n: Nudge): Nudge {
    return !n.unread && had.some((x) => x.id === n.id && x.unread) ? { ...n, unread: true } : n
}

export const { setNudges, upsertNudge, setOpenCount, removeNudge, clearAllNudges, nudgesCleared, nudgeOpened } = nudgeSlice.actions
export default nudgeSlice
