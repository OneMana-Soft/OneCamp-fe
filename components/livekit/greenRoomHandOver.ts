import type { LocalVideoTrack } from "livekit-client"

/**
 * The green room's camera and microphone, handed to the call at Join (29 Oct
 * 2026), so the call sends the very tracks the preview showed: Join asks the
 * browser for nothing more, and the camera's light never goes off and on.
 *
 * Who stops them: the green room until Join; from Join the call. The call
 * sends what is still live once it connects (LiveKit stops what it sends when
 * the call ends) and stops what it doesn't send. A join that never gets a
 * call (the server didn't answer) leaves them with the green room, which
 * still shows them.
 */
export interface GreenRoomTracks {
  /** The camera as the browser opened it, with LiveKit's track over it once its client came (the effects are on that). */
  camera?: { track: MediaStreamTrack; constraints: MediaTrackConstraints; liveKit?: LocalVideoTrack }
  /** The meter's microphone. */
  mic?: { track: MediaStreamTrack; constraints: MediaTrackConstraints }
  /**
   * Whether the green room that gave them is still open. A join that gets no
   * call gives them back to it to show; if it has gone (a page drew something
   * else over it mid-join), nobody would, so the lifecycle stops them.
   */
  greenRoomOpen?: () => boolean
}

/** A track the browser still has open. */
export function isLive(track?: MediaStreamTrack): track is MediaStreamTrack {
  return track?.readyState === "live"
}

/** Stops the camera (with LiveKit's track over it and its effect) and the microphone. Stopping a stopped track does nothing. */
export function stopGiven(tracks?: GreenRoomTracks): void {
  if (tracks?.camera?.liveKit) tracks.camera.liveKit.stop()
  tracks?.camera?.track.stop()
  tracks?.mic?.track.stop()
}
