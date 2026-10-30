import { CALL_MIC } from "@/lib/calls/callMic"

/**
 * The green room's camera as LiveKit's createLocalVideoTrack opened it: the
 * camera picked here before (else the browser's), at 720p. The device is
 * asked for as ideal, which opens it when it is there and another camera when
 * it isn't, in one request (LiveKit asked for it exactly, then again). No
 * facing mode: none is asked for in the green room or the call. Pure.
 */
export function cameraConstraints(deviceId?: string): MediaTrackConstraints {
  return { ...(deviceId ? { deviceId: { ideal: deviceId } } : {}), width: 1280, height: 720 }
}

/**
 * The microphone the green room's meter listens to, asked as the call asks
 * for it: the one picked here (else the browser's), with LiveKit's own
 * processing (its audio defaults: gain, echo cancellation, noise suppression,
 * voice isolation) and the call's. After Join the call sends this very track
 * (greenRoomHandOver), so it must be the microphone the call would open. Pure.
 */
export function micConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    voiceIsolation: true,
    ...CALL_MIC,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  } as MediaTrackConstraints
}
