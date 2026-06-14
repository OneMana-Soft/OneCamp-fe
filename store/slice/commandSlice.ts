// Redux slice for ephemeral/interactive slash-command cards. These are NOT
// persisted messages — they live only in client state (like Slack's ephemeral
// messages and the AI ActionConfirmation pattern). Cards are keyed by the
// conversation surface (channel uuid or dm grouping id) so each open
// conversation shows only its own command output, plus a trigger id for
// matching async (deferred/external) responses that arrive over MQTT.

import { createSlice, PayloadAction } from "@reduxjs/toolkit"
import type { CommandResponse } from "@/types/command"

export interface EphemeralCard {
    trigger_id: string
    surface_key: string // channel uuid or dm grouping id ("" for global)
    command: string // originating command name, needed for interaction round-trips
    response: CommandResponse
    created_at: number
}

interface CommandState {
    // surface_key -> ordered list of cards
    cards: Record<string, EphemeralCard[]>
}

const initialState: CommandState = {
    cards: {},
}

const MAX_CARDS_PER_SURFACE = 8

const commandSlice = createSlice({
    name: "command",
    initialState,
    reducers: {
        // Add or replace a card. If replace_original is set and a card with the
        // same trigger_id exists, it is swapped in place (interactive update).
        upsertCard: (state, action: PayloadAction<EphemeralCard>) => {
            const card = action.payload
            const list = state.cards[card.surface_key] || []
            const idx = list.findIndex((c) => c.trigger_id === card.trigger_id)
            if (idx >= 0) {
                list[idx] = card
            } else {
                list.push(card)
                // Cap history so a chatty surface can't grow unbounded.
                if (list.length > MAX_CARDS_PER_SURFACE) {
                    list.splice(0, list.length - MAX_CARDS_PER_SURFACE)
                }
            }
            state.cards[card.surface_key] = list
        },
        // Dismiss a single card.
        dismissCard: (
            state,
            action: PayloadAction<{ surface_key: string; trigger_id: string }>,
        ) => {
            const { surface_key, trigger_id } = action.payload
            const list = state.cards[surface_key]
            if (!list) return
            state.cards[surface_key] = list.filter((c) => c.trigger_id !== trigger_id)
        },
        // Clear all cards for a surface (e.g. on conversation change).
        clearSurface: (state, action: PayloadAction<{ surface_key: string }>) => {
            delete state.cards[action.payload.surface_key]
        },
    },
})

export const { upsertCard, dismissCard, clearSurface } = commandSlice.actions
export { commandSlice }
export default commandSlice.reducer
