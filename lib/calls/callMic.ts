/**
 * What a call asks of a microphone beyond its device and its processing: one
 * channel at 48 kHz, 16-bit, for speech. The ONE copy: the room's capture
 * defaults (components/livekit/roomOptions), the green room's meter, whose
 * track the call sends after Join (components/livekit/greenRoomCamera), and a
 * noise level's restart (processors/noise) all spread it, so the call never
 * opens its microphone two ways. A leaf with no imports, so whatever takes it
 * takes nothing else.
 */
export const CALL_MIC = { channelCount: 1, sampleRate: { ideal: 48000 }, sampleSize: 16 } satisfies MediaTrackConstraints
