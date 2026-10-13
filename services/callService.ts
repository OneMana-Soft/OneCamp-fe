import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall } from "@/services/publicApi"
import type { CallStateRead, CallTranscription } from "@/components/livekit/callState"

// The calls' own requests, from the CALLS-FE ↔ CALLS-BE contract
// (design/calls-vs-zoom/P0.md, 13 Oct): turning captions on for a call,
// reading a call before joining it, removing someone, and an instant
// meeting's page. Kept here rather than in endPoints.ts so the shared
// endpoint list (which the project route loads) doesn't grow for them.

export type CallKind = "channel" | "chat" | "group"

/** The green room's read of a channel, DM or group call, before joining (CALL-BUG-12). */
export function callStatePath(kind: CallKind, id: string): string {
    if (!id) return ""
    const base = kind === "channel" ? "/ch/callState" : kind === "chat" ? "/dm/callState" : "/groupChat/callState"
    return `${base}/${encodeURIComponent(id)}`
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

/** Removes a person from the call (CALL-BUG-11). The server tells them why, then disconnects them. */
export async function removeFromCall(roomName: string, identity: string): Promise<void> {
    await axiosInstance.post("/livekit/remove-participant", { room_name: roomName, identity }, OWN_ERRORS)
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
