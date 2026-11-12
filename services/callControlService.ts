import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { CallBoard, CallTranscription } from "@/components/livekit/callState"
import type { CallAction } from "@/lib/calls/control"
import type { CallHold } from "@/lib/calls/holds"

// What a call asks of the server while it runs (CALLS-FE <-> CALLS-BE,
// design/calls-vs-zoom/P0.md): what the people running it do to it, and its
// captions. Only the call's own code imports this file, so the call's lazy
// code is the same whichever page opened it; services/callService holds what
// the call pages ask before it (components/livekit/callBuildsOnceGuard).

/**
 * Asks for something the people running a call may do (business/CallControl).
 * The caller says a refusal in the server's words.
 */
export async function actInCall(
    sessionId: string,
    act: { action: CallAction; identity?: string; source?: string; on?: boolean; what?: CallHold; feedback?: string; ticket?: string; board?: string; draw?: CallBoard["draw"]; slide?: string; rooms?: string[]; room?: number; minutes?: number; text?: string },
): Promise<{ affected: number }> {
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
