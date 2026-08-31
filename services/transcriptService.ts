import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "./endPoints"

export interface TranscriptLineInput {
    room_name: string
    text: string
    /** Milliseconds from recording start, when a recording is running. */
    offset_ms?: number
}

/**
 * Persist one final utterance the caller spoke.
 *
 * The server takes the speaker from the session and checks the caller is in the
 * room, so this body carries no identity: it cannot be used to put words in
 * anyone else's mouth, or into a call the caller is not in.
 *
 * Never throws. It is called once per utterance during a live call, and a
 * failed save must not interrupt a conversation or spill an error over the
 * captions. A refusal is also the ordinary answer for a moment after everyone
 * hangs up, which is not worth reporting to anybody.
 */
export async function persistTranscriptLine(line: TranscriptLineInput): Promise<void> {
    if (!line.room_name || !line.text.trim()) return
    try {
        await axiosInstance.post(PostEndpointUrl.SaveMyTranscript, line, {
            // @ts-expect-error — suppress the global loading bar for this background write
            silent: true,
        })
    } catch {
        // Deliberately swallowed; see above.
    }
}

/**
 * Tell the server this browser cannot transcribe, so the record can say so.
 *
 * Only the negative is worth sending. Being able to transcribe is the
 * assumption everywhere else, and reporting it would be every participant of
 * every call announcing the absence of a problem.
 *
 * Never throws, and called once per call: a failure here costs a caveat on one
 * recap, not the call.
 */
export async function reportTranscriptionCapability(roomName: string, canTranscribe: boolean): Promise<void> {
    if (!roomName) return
    try {
        await axiosInstance.post(PostEndpointUrl.ReportTranscriptionCapability, {
            room_name: roomName,
            can_transcribe: canTranscribe,
        }, {
            // @ts-expect-error — suppress the global loading bar for this background write
            silent: true,
        })
    } catch {
        // Deliberately swallowed; see above.
    }
}
