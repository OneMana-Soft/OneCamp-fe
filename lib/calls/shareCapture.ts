import { AudioPresets, type AudioCaptureOptions, type ScreenShareCaptureOptions, type TrackPublishOptions } from "livekit-client"

/** The capture constraints this browser knows (none outside a browser). */
function browserConstraints(): MediaTrackSupportedConstraints {
  return typeof navigator === "undefined" ? {} : (navigator.mediaDevices?.getSupportedConstraints?.() ?? {})
}

/**
 * What a share asks the browser for (meet-14): the tab's sound with its
 * picture (Chrome's "Also share tab audio", on by default for a tab; on
 * Windows and ChromeOS a whole screen's sound too, when the sharer ticks it
 * and the browser can leave the call's own sound out),
 * never the call's own tab (a hall of mirrors, with the call's sound sent back
 * into it), and Chrome's "Share this tab instead" while sharing. A browser
 * that can't capture sound shares the picture alone. A fresh object for each
 * share, as LiveKit writes its default resolution into the one it's given.
 *
 * The capture leaves the call's own sound, everyone's voices, out
 * (restrictOwnAudio), and a whole screen's sound is offered only by a browser
 * that can do that: otherwise a whole-screen share sends the call back into
 * itself, an echo for everyone (DESIGN-BUILD-55). A tab's sound is never the
 * call's, as the call's own tab is never offered.
 */
export function shareCapture(supported: MediaTrackSupportedConstraints = browserConstraints()): ScreenShareCaptureOptions {
  // restrictOwnAudio is newer than TypeScript's DOM types; a browser that doesn't know it ignores it.
  const audio: AudioCaptureOptions & { restrictOwnAudio: boolean } = { restrictOwnAudio: true }
  const leavesOwnSoundOut = (supported as { restrictOwnAudio?: boolean }).restrictOwnAudio === true
  return {
    audio,
    systemAudio: leavesOwnSoundOut ? "include" : "exclude",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
  }
}

/**
 * How a share's sound is sent: as music, in stereo, without the speech savers
 * that drop a quiet passage (DTX) or double the bitrate against loss (RED).
 * These touch the share's sound alone: its picture keeps the room's
 * screen-share encoding.
 */
export const SHARE_PUBLISH: TrackPublishOptions = {
  audioPreset: AudioPresets.musicStereo,
  dtx: false,
  red: false,
  forceStereo: true,
}
