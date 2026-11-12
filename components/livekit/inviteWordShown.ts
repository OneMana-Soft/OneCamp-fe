import { createContext } from "react"

/**
 * Invite says its word wherever it stands, not only where the call has room:
 * at the head of People. A file of its own, so the call's People panel takes
 * this and not the invite panel's code, which an instant meeting's page has
 * loaded and other call pages haven't (components/livekit/callBuildsOnceGuard).
 */
export const InviteWordShown = createContext(false)
