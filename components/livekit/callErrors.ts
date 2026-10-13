// Why a call's microphone, camera or screen action failed, in words a person
// can act on (CALL-BUG-1, CALL-BUG-19). The dock used to fire these actions
// and drop the answer: a refused microphone left the button red and the
// reason in the console, so someone who joined muted could never be heard and
// was never told why. Pure, and free of LiveKit, so it is tested alone.

import { SCREEN_UNAVAILABLE, mediaFailure, type MediaDevice } from "@/lib/media/mediaFailure"

export type CallDevice = MediaDevice

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
  // The browser's own refusals: one mapper for the app (lib/media).
  return mediaFailure(device, error)
}

export { SCREEN_UNAVAILABLE }

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

// --- A call that never connected (CALL-BUG-23) ---

/** Why a call never connected, by what the person can do about it. */
export type ConnectFailure = "network" | "permission" | "server"

// livekit-client's ConnectionErrorReason (NotAllowed 0, ServerUnreachable 1,
// InternalError 2, Cancelled 3, LeaveRequest 4, Timeout 5) and the
// DisconnectReasons that mean the join itself failed. Numbers, so this file
// stays free of LiveKit.
const REASON_NOT_ALLOWED = 0
const REASON_UNREACHABLE = 1
const REASON_TIMEOUT = 5
const DISCONNECT_SERVER = new Set([3 /* SERVER_SHUTDOWN */, 6 /* STATE_MISMATCH */])

/**
 * Which kind of failure kept a call from connecting: the network (LiveKit
 * unreachable, ICE failed, timed out), permission (the server refused the
 * token) or the server itself. Anything unclear is the network, the likeliest
 * and the one a person can check. Pure.
 */
export function connectFailureOf(error: unknown, disconnectReason?: number): ConnectFailure {
  const e = (error && typeof error === "object" ? error : {}) as { name?: string; reason?: number; status?: number; message?: string }
  const message = String(e.message ?? "")
  if (e.reason === REASON_NOT_ALLOWED || e.status === 401 || e.status === 403 || /not allowed|unauthori[sz]ed|invalid token|permission/i.test(message)) return "permission"
  if (e.reason === REASON_UNREACHABLE || e.reason === REASON_TIMEOUT || /pc connection|ice|timed out|timeout|unreachable|websocket|network|fetch/i.test(message)) return "network"
  if ((typeof e.status === "number" && e.status >= 500) || /internal|server/i.test(message)) return "server"
  if (disconnectReason !== undefined && DISCONNECT_SERVER.has(disconnectReason)) return "server"
  return "network"
}

/** What a failed connection says, by its kind. */
export const CONNECT_FAILURE_TEXT: Record<ConnectFailure, string> = {
  network: "Your network couldn't reach the call. Check your connection, then try again.",
  permission: "The call server didn't accept the connection. Trying again asks it for a new one.",
  server: "The call server had a problem. Try again in a moment.",
}

/**
 * Why this app can't make calls at all, or null. The Linux desktop app's
 * WebKitGTK is built without WebRTC on every mainstream distribution, so
 * LiveKit can't connect there: offer the browser instead of a Join that
 * fails. Pure.
 */
export function callsUnavailableHere(win: { __TAURI__?: unknown; RTCPeerConnection?: unknown } | undefined = typeof window === "undefined" ? undefined : (window as unknown as { __TAURI__?: unknown; RTCPeerConnection?: unknown })): string | null {
  if (!win || !win.__TAURI__) return null
  return typeof win.RTCPeerConnection === "undefined" ? "This app can't join calls on this computer yet. Your browser can." : null
}
