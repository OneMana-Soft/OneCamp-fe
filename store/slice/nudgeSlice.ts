import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import type { Nudge } from "@/services/nudgeService"

// nudgeSlice holds the current user's open proactive nudges plus the badge
// count. State is fed from BOTH the REST list (on load) and live MQTT events
// (new nudge / count cleared), and reads are transport-agnostic — the bell
// component just renders `nudges` + `openCount`.

interface NudgeState {
    nudges: Nudge[]
    openCount: number
    // Whether the initial REST hydration has happened, so the bell can show a
    // skeleton vs. an empty state correctly.
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
        // A live "new nudge" arrived over MQTT. Dedup by id (the engine may
        // refresh-and-republish the same nudge), newest/highest-priority first.
        upsertNudge: (state, action: PayloadAction<Nudge>) => {
            const n = action.payload
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
    },
})

export const { upsertNudge, setOpenCount,} = nudgeSlice.actions
export default nudgeSlice
