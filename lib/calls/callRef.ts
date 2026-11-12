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

/** A room's call as Call State names it (CallState RefOfRoom), or null. Pure. */
export function callRefOfRoom(room: string): CallRef | null {
    if (room.startsWith("meet-")) return room.length > 5 ? { kind: "meeting", id: room.slice(5) } : null
    if (/^[0-9a-f-]{36} [0-9a-f-]{36}$/i.test(room)) return { kind: "dm", id: room }
    if (/^[0-9a-f]{32}$/.test(room)) return { kind: "group", id: room }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room)) return { kind: "channel", id: room }
    return null
}
