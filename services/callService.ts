import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall } from "@/services/publicApi"
import { doorPath, type GuestDoor } from "@/services/guestDoor"

// The calls' own requests, from the CALLS-FE ↔ CALLS-BE contract
// (design/calls-vs-zoom/P0.md, 13 Oct) and Call State's (17 Oct): reading a
// call, and an instant meeting's page. What a call asks while it runs (what
// the people running it do to it, its captions) is services/callControlService.
// Kept here rather than in endPoints.ts so the shared endpoint list (which the
// project route loads) doesn't grow for them.

export { callCurrentPath, callReadKeyOf, callRefOf, type CallKind, type CallRef } from "@/lib/calls/callRef"

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

/** Joining as a guest at a door, in their language. 403 is a removal, a ticket a lobby (guestKnock), 401 "locked" a room's passcode. */
export const joinGuestMeetingAs = (door: GuestDoor, displayName: string, language?: string) =>
    publicCall<{ token?: string; room?: string; ticket?: string }>(doorPath(door, "/join"), {
        method: "POST",
        body: JSON.stringify({
            display_name: displayName,
            audio_enabled: true,
            video_enabled: true,
            ...(language ? { language } : {}),
            ...(door.invitation ? { invitation: door.invitation } : {}),
        }),
    })
