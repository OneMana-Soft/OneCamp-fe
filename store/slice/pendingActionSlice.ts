import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import type { PendingAction, PendingActionStatus } from "@/services/pendingActionService"

// pendingActionSlice holds the current user's open durable AI write approvals.
// State is fed from BOTH the REST list (reconcile-on-load) and live MQTT events
// ("created" upserts a card; "resolved" updates it to its terminal state and
// then it is pruned). Reads are transport-agnostic: the in-thread tray just
// filters `actions` by the surface it is rendering.

interface PendingActionState {
    actions: PendingAction[]
    // Whether the initial REST hydration has happened (so a surface can avoid
    // flashing an empty state before the first list lands).
    hydrated: boolean
}

const initialState: PendingActionState = {
    actions: [],
    hydrated: false,
}

// Keep only open (pending) actions in the visible set, newest first.
function sortOpen(actions: PendingAction[]): PendingAction[] {
    return actions
        .filter((a) => a.status === "pending")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export const pendingActionSlice = createSlice({
    name: "pendingAction",
    initialState,
    reducers: {
        // Full replace from the REST list endpoint.
        setPendingActions: (state, action: PayloadAction<PendingAction[]>) => {
            state.actions = sortOpen(Array.isArray(action.payload) ? action.payload : [])
            state.hydrated = true
        },
        // A live "created" arrived (or a local create). Dedup by id.
        upsertPendingAction: (state, action: PayloadAction<PendingAction>) => {
            const a = action.payload
            const idx = state.actions.findIndex((x) => x.id === a.id)
            if (idx >= 0) {
                state.actions[idx] = a
            } else {
                state.actions.unshift(a)
            }
            state.actions = sortOpen(state.actions)
        },
        // Optimistic in-flight state so a double click can't re-fire.
        markPendingActionStatus: (
            state,
            action: PayloadAction<{ id: string; status: PendingActionStatus }>,
        ) => {
            const a = state.actions.find((x) => x.id === action.payload.id)
            if (a) a.status = action.payload.status
        },
        // A live "resolved" arrived, or the approve/reject call returned: drop
        // the card from the open set (its terminal outcome is shown by the
        // posted bot message / toast).
        removePendingAction: (state, action: PayloadAction<string>) => {
            state.actions = state.actions.filter((a) => a.id !== action.payload)
        },
        clearAllPendingActions: (state) => {
            state.actions = []
        },
    },
})

export const {
    setPendingActions,
    upsertPendingAction,
    markPendingActionStatus,
    removePendingAction,
    clearAllPendingActions,
} = pendingActionSlice.actions
export default pendingActionSlice
