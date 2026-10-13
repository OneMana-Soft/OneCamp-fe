import { AudioPresets, supportsAudioOutputSelection, type RoomOptions } from "livekit-client"
import type { DevicePrefs } from "./callDevices"

/**
 * The call's room options, in one place, so a refactor can't drop them
 * again (CALL-BUG-20, CALL-BUG-21).
 *
 * - Adaptive stream: each tile asks for the layer its size needs, and a tile
 *   out of view is paused. Dynacast: a camera stops encoding the layers
 *   nobody is watching. Without them, a nine-person grid on a laptop decoded
 *   eight 720p streams into 300px tiles, and every camera encoded all three
 *   layers for the whole call.
 * - Speech, not music: a call's audio is voice, at half music's bitrate.
 * - The devices picked in the green room, as the room's defaults, so turning
 *   the microphone or camera on later in the call opens the same device.
 *   LiveKit's own defaults (echo cancellation, noise suppression, voice
 *   isolation) stay underneath: a hand-built audio object used to drop
 *   voice isolation.
 * - The speaker picked in the green room, where the browser can choose an
 *   output at all (Safari can't). It used to play on the system default.
 * - One peer connection would join about a second faster on the LiveKit we
 *   ship (v1.11.0), but it stays off for now: livekit-client 2.16 sends the
 *   single-connection join whenever it is asked to and never falls back
 *   (SignalClient.connect builds the join_request form, and RTCEngine sets
 *   up a publisher-only connection, with no check of the server between), so
 *   a workspace pointed at an older LiveKit could not join at all. Wave A.
 */
export function callRoomOptions(prefs: DevicePrefs, canPickSpeaker: boolean = supportsAudioOutputSelection()): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    singlePeerConnection: false,
    publishDefaults: { audioPreset: AudioPresets.speech },
    audioCaptureDefaults: {
      ...(prefs.audioinput ? { deviceId: prefs.audioinput } : {}),
      channelCount: 1,
      sampleRate: { ideal: 48000 },
      sampleSize: 16,
    },
    videoCaptureDefaults: prefs.videoinput ? { deviceId: prefs.videoinput } : {},
    ...(canPickSpeaker && prefs.audiooutput ? { audioOutput: { deviceId: prefs.audiooutput } } : {}),
  }
}
