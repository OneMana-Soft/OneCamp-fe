import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall } from "@/services/publicApi"
import type { CallTranscription } from "@/components/livekit/callState"
import type { CallAction } from "@/lib/calls/control"

// The calls' own requests, from the CALLS-FE ↔ CALLS-BE contract
// (design/calls-vs-zoom/P0.md, 13 Oct) and Call State's (17 Oct): turning
// captions on for a call, reading a call, what the people running it do to
// it, and an instant meeting's page. Kept here rather than in endPoints.ts so
// the shared endpoint list (which the project route loads) doesn't grow for
// them.

export type CallKind = "channel" | "chat" | "group"

/** What a call belongs to, as the server's Call State names it. */
export interface CallRef {
    kind: "channel" | "dm" | "group" | "meeting"
    id: string
}

/**
 * The call a page's own call is: a channel's by its uuid, a group's by its
 * id, a DM's by both people's uuids sorted with a space between (the server's
 * helpers.GetGroupingId), and an instant meeting's by its id. Null until
 * whoever is signed in is known, for a DM. Pure.
 */
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

/**
 * The read a call-state message refreshes (MESSAGE_CALL_STATE): its
 * conversation's or instant meeting's GET /calls/current, the same key
 * useCallSession reads, or "" for anything else. Pure.
 */
export function callReadKeyOf(state: unknown): string {
    const s = state as { resource_kind?: unknown; resource_id?: unknown } | null | undefined
    const kind = s?.resource_kind
    const id = s?.resource_id
    if (typeof id !== "string" || !id) return ""
    if (kind !== "channel" && kind !== "dm" && kind !== "group" && kind !== "meeting") return ""
    return callCurrentPath({ kind, id })
}

/**
 * Asks for something the people running a call may do (business/CallControl).
 * The caller says a refusal in the server's words.
 */
export async function actInCall(sessionId: string, act: { action: CallAction; identity?: string; source?: string; on?: boolean }): Promise<{ affected: number }> {
    const res = await axiosInstance.post(`/calls/${encodeURIComponent(sessionId)}/act`, act, OWN_ERRORS)
    return (res.data as { data?: { affected: number } })?.data ?? { affected: 0 }
}

/**
 * Turns captions on or off for everyone in the call (CALL-BUG-2). The
 * server writes the switch into the room, which is how every screen learns
 * of it. The caller explains a refusal itself.
 */
export async function setCallTranscription(roomName: string, on: boolean): Promise<CallTranscription | undefined> {
    const res = await axiosInstance.post("/livekit/transcription", { room_name: roomName, on }, OWN_ERRORS)
    return (res.data as { data?: CallTranscription })?.data
}

// --- Instant meetings: the page the creator can come back to (CALL-BUG-17) ---

export interface InstantMeetingCreated {
    room: string
    meeting_id: string
    host_token: string
    guest_token: string
    grant_id: string
    expires_at: string
}

/** The meeting's id from its room ("meet-<uuid>"), for servers that don't send meeting_id. Pure. */
export function meetingIdOf(m: Pick<InstantMeetingCreated, "room"> & { meeting_id?: string }): string {
    return m.meeting_id || m.room.replace(/^meet-/, "")
}

export async function createInstantMeetingAs(language?: string): Promise<InstantMeetingCreated> {
    const res = await axiosInstance.post("/meet/instant", { audio_enabled: true, video_enabled: true, ...(language ? { language } : {}) }, OWN_ERRORS)
    return (res.data as { data: InstantMeetingCreated }).data
}

export const instantMeetingPath = (meetingId: string) => (meetingId ? `/meet/instant/${encodeURIComponent(meetingId)}` : "")

export async function joinInstantMeeting(meetingId: string, language?: string): Promise<{ room: string; host_token: string }> {
    const res = await axiosInstance.post(`${instantMeetingPath(meetingId)}/join`, language ? { language } : {}, OWN_ERRORS)
    return (res.data as { data: { room: string; host_token: string } }).data
}

/**
 * A new guest link for the meeting. With revokePrevious, the old link stops
 * working and everyone still on it is removed (reason "link_revoked").
 */
export async function newInstantMeetingLink(meetingId: string, revokePrevious: boolean): Promise<{ guest_token: string; grant_id: string; expires_at: string }> {
    const res = await axiosInstance.post(`${instantMeetingPath(meetingId)}/link`, { revoke_previous: revokePrevious }, OWN_ERRORS)
    return (res.data as { data: { guest_token: string; grant_id: string; expires_at: string } }).data
}

// --- Guests (no account) ---

/** Joining from a guest link, with the guest's language for the server's agent. A 403 is a removal. */
export const joinGuestMeetingAs = (token: string, displayName: string, language?: string) =>
    publicCall<{ token: string; room: string }>(`/guest/meet/${encodeURIComponent(token)}/join`, {
        method: "POST",
        body: JSON.stringify({ display_name: displayName, audio_enabled: true, video_enabled: true, ...(language ? { language } : {}) }),
    })
