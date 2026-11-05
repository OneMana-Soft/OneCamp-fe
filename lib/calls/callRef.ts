// Pure and small, so a conversation's page reads its call without services/callService.

export type CallKind = "channel" | "chat" | "group"

/** What a call belongs to, as the server's Call State names it. */
export interface CallRef {
    kind: "channel" | "dm" | "group" | "meeting"
    id: string
}

/** The call a page's own call is: a channel's by its uuid, a group's by its id, a DM's by both people's uuids sorted with a space between (the server's helpers.GetGroupingId), and an instant meeting's by its id. Pure. */
export function callRefOf(kind: CallKind | "meeting", id: string, selfUUID?: string): CallRef | null {
    if (!id) return null
    if (kind === "chat") return selfUUID ? { kind: "dm", id: [id, selfUUID].sort().join(" ") } : null
    if (kind === "meeting") return { kind: "meeting", id }
    return { kind, id }
}

/** A member's read of the call going on in a conversation or meeting (Call State). */
export function callCurrentPath(ref: CallRef | null): string {
    if (!ref) return ""
    return `/calls/current?kind=${ref.kind}&id=${encodeURIComponent(ref.id)}`
}

/** The read a call-state message refreshes (MESSAGE_CALL_STATE): its conversation's or instant meeting's GET /calls/current, the same key useCallSession reads, or "" for anything else. Pure. */
export function callReadKeyOf(state: unknown): string {
    const s = state as { resource_kind?: unknown; resource_id?: unknown } | null | undefined
    const kind = s?.resource_kind
    const id = s?.resource_id
    if (typeof id !== "string" || !id) return ""
    if (kind !== "channel" && kind !== "dm" && kind !== "group" && kind !== "meeting") return ""
    return callCurrentPath({ kind, id })
}
