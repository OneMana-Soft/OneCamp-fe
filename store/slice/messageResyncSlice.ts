import { createSlice } from "@reduxjs/toolkit"

/**
 * Message resync coordinator.
 *
 * When the MQTT connection comes back after a gap long enough that we
 * can't trust the broker's persistent session to have buffered every
 * message (see useMessageSyncManager / STALE_THRESHOLD_MS), we need the
 * currently-mounted conversation views to pull anything they might have
 * missed.
 *
 * Crucially we do NOT clear the loaded messages to achieve this — wiping
 * Redux state makes the message pane flash empty (and, if the refetch
 * effect's dependencies don't notice the wipe, stay empty). Instead we
 * bump a monotonic `nonce`. Mounted message lists subscribe to it,
 * revalidate their "latest" query, and WINDOW-RECONCILE the result into the
 * messages already on screen: within the contiguous time-range the latest
 * window covers, the server is authoritative, so missed messages appear,
 * edits are refreshed in place, and messages deleted while idle are removed.
 * Older paginated history and just-sent optimistic messages (outside the
 * window's range) are never touched, so there's no empty flash and nothing
 * unconfirmed is lost. See the merge* reducers for the exact rules.
 *
 * `nonce` is monotonically increasing so every reconnect is observed as
 * a distinct change even if two land in the same tick.
 */
interface MessageResyncState {
    nonce: number
}

const initialState: MessageResyncState = {
    nonce: 0,
}

export const messageResyncSlice = createSlice({
    name: "messageResync",
    initialState,
    reducers: {
        // Signal every mounted conversation view to reconcile against the
        // server. Mounted lists react by revalidating + merging; unmounted
        // ones do nothing until they next mount (which is a cold fetch).
        triggerMessageResync: (state) => {
            state.nonce += 1
        },
    },
})

export const { triggerMessageResync } = messageResyncSlice.actions

export default messageResyncSlice
