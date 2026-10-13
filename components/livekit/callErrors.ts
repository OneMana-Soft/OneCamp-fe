// Why a call's microphone, camera or screen action failed, in words a person
// can act on (CALL-BUG-1, CALL-BUG-19). The dock used to fire these actions
// and drop the answer: a refused microphone left the button red and the
// reason in the console, so someone who joined muted could never be heard and
// was never told why. Pure, and free of LiveKit, so it is tested alone.

export type CallDevice = "microphone" | "camera" | "screen"

export interface CallFailure {
  title: string
  description: string
}

const NAMES: Record<CallDevice, string> = { microphone: "microphone", camera: "camera", screen: "screen" }

/** The DOMException name, or LiveKit's own error name, of whatever was thrown. */
function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name ?? "") : ""
}

function errorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : ""
}

/**
 * What to tell someone whose microphone, camera or screen share didn't
 * start, or null when there is nothing to say: closing the browser's screen
 * picker is a choice, not a failure. Pure.
 */
export function callMediaFailure(device: CallDevice, error: unknown): CallFailure | null {
  const name = errorName(error)
  const message = errorMessage(error)
  const thing = NAMES[device]

  // The call itself refused the track: the token left this source out.
  if (name === "PublishTrackError" || /insufficient permissions/i.test(message)) {
    return device === "screen"
      ? { title: "This call doesn't allow screen sharing", description: "Ask the host, or leave and rejoin the call." }
      : { title: `This call didn't allow your ${thing}`, description: "Leave and rejoin the call, then try again." }
  }

  if (device === "screen") {
    if (name === "DeviceUnsupportedError" || name === "NotSupportedError" || name === "NotFoundError") return { title: SCREEN_UNAVAILABLE, description: "Share from a computer instead." }
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      // Chrome says "by system" when the computer, not the person, said no.
      if (/system/i.test(message)) {
        return { title: "Your computer blocked screen sharing", description: "Allow screen recording for your browser in your computer's privacy settings, then try again." }
      }
      return null
    }
    if (name === "AbortError") return null
    return { title: "Couldn't share your screen", description: "Try again, or pick a different window." }
  }

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return {
        title: `Your browser blocked the ${thing}`,
        description: `Allow the ${thing} for this site from the icon at the left of the address bar, then try again.`,
      }
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return { title: `No ${thing} was found`, description: `Connect a ${thing}, or choose another in the menu beside the button.` }
    case "NotReadableError":
    case "TrackStartError":
      return { title: `Your ${thing} is in use`, description: `Another app may be using it. Close that app, then try again.` }
  }
  return { title: `Couldn't turn on your ${thing}`, description: "Try again, or choose another device." }
}

/** The reason Share screen is unavailable, said on the control and in its toast. */
export const SCREEN_UNAVAILABLE = "Screen sharing isn't available in this browser"

/**
 * Whether this browser can share a screen at all (CALL-BUG-19). Phone
 * browsers have no getDisplayMedia, and the dock offered Share anyway and
 * swallowed the error. Read from the prototype where there is one:
 * livekit-client's Firefox shim puts a stand-in on the instance that only
 * fails later.
 */
export function canShareScreen(
  nav: { mediaDevices?: unknown } | undefined = typeof navigator === "undefined" ? undefined : navigator,
  proto: object | undefined = typeof MediaDevices === "undefined" ? undefined : MediaDevices.prototype,
): boolean {
  if (!nav?.mediaDevices) return false
  if (proto) return typeof (proto as { getDisplayMedia?: unknown }).getDisplayMedia === "function"
  return typeof (nav.mediaDevices as { getDisplayMedia?: unknown }).getDisplayMedia === "function"
}
