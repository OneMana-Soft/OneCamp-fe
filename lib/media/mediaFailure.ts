// Why a microphone, camera or screen capture didn't start, in words a person
// can act on: one mapper for the browser's refusals (calls audit). The call's
// dock, its green room and its connect path read it; LiveKit's own refusal
// (a token without the source) stays in components/livekit/callErrors.
// Pure.

export type MediaDevice = "microphone" | "camera" | "screen"

export interface MediaFailure {
  title: string
  description: string
}

const NAMES: Record<MediaDevice, string> = { microphone: "microphone", camera: "camera", screen: "screen" }

/** The reason Share screen is unavailable, said on the control and in its toast. */
export const SCREEN_UNAVAILABLE = "Screen sharing isn't available in this browser"

function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error ? String((error as { name?: unknown }).name ?? "") : ""
}

function errorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : ""
}

/** Why a microphone or camera didn't start: refused, not there, in use by something else, or another reason. */
type MediaFailureKind = "denied" | "missing" | "busy" | "other"

/** What kind of refusal a microphone's or camera's error is, by the browser's name for it. Pure. */
export function mediaFailureKind(error: unknown): MediaFailureKind {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied"
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "missing"
    case "NotReadableError":
    case "TrackStartError":
      return "busy"
  }
  return "other"
}

interface MediaFailureOptions {
  /** A menu beside the button picks the device (a call's dock), so the words point to it. True by default. */
  deviceMenu?: boolean
}

/**
 * What to tell someone whose microphone, camera or screen didn't start, or
 * null when there is nothing to say: closing the browser's screen picker is a
 * choice, not a failure. Pure.
 */
export function mediaFailure(device: MediaDevice, error: unknown, { deviceMenu = true }: MediaFailureOptions = {}): MediaFailure | null {
  const name = errorName(error)
  const message = errorMessage(error)
  const thing = NAMES[device]

  if (device === "screen") {
    if (name === "DeviceUnsupportedError" || name === "NotSupportedError" || name === "NotFoundError") return { title: SCREEN_UNAVAILABLE, description: "Share from a computer instead." }
    // The Linux desktop app, with no screencast portal (an X11 session): measured by the desktop fixer.
    if (name === "OverconstrainedError") return { title: "Screen sharing isn't available on this computer", description: "Share from a browser instead." }
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

  switch (mediaFailureKind(error)) {
    case "denied":
      return {
        title: `Your browser blocked the ${thing}`,
        description: `Allow the ${thing} for this site from the icon at the left of the address bar, then try again.`,
      }
    case "missing":
      return { title: `No ${thing} was found`, description: deviceMenu ? `Connect a ${thing}, or choose another in the menu beside the button.` : `Connect a ${thing}, then try again.` }
    case "busy":
      return { title: `Your ${thing} is in use`, description: `Another app may be using it. Close that app, then try again.` }
  }
  return { title: `Couldn't turn on your ${thing}`, description: deviceMenu ? "Try again, or choose another device." : "Try again in a moment." }
}
