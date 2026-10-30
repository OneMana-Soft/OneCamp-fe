import { LocalAudioTrack, LocalVideoTrack, Track } from "livekit-client"

// The green room's part of LiveKit's client, loaded with it after the picture
// shows: none of a room page's first load. The call wraps what the green room
// hands it the same way (greenRoomHandOver).

/**
 * A camera the green room opened, as LiveKit's own track (for the effects,
 * which need its processors): the same MediaStreamTrack, so the picture
 * never goes and nothing is asked for again. Wrapped as createLocalTracks
 * wraps the cameras it opens, so LiveKit stops it and opens it again itself
 * (after a phone's background ends it), on the device the person allowed.
 */
export function liveKitCamera(camera: MediaStreamTrack, constraints: MediaTrackConstraints): LocalVideoTrack {
  const deviceId = camera.getSettings().deviceId
  const track = new LocalVideoTrack(camera, deviceId ? { ...constraints, deviceId } : constraints, false)
  track.source = Track.Source.Camera
  track.mediaStream = new MediaStream([camera])
  return track
}

/**
 * The green room's microphone as LiveKit's own track, for the call to send:
 * the same MediaStreamTrack the meter listened to, wrapped as the camera is,
 * so LiveKit opens it again itself when the person picks another microphone.
 */
export function liveKitMic(mic: MediaStreamTrack, constraints: MediaTrackConstraints): LocalAudioTrack {
  const deviceId = mic.getSettings().deviceId
  const track = new LocalAudioTrack(mic, deviceId ? { ...constraints, deviceId } : constraints, false)
  track.source = Track.Source.Microphone
  track.mediaStream = new MediaStream([mic])
  return track
}
