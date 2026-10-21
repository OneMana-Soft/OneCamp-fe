/**
 * Desktop notices: native notifications in the OneCamp desktop app.
 *
 * The app's webview has no web push, so the server tells it of a message the
 * way it pushes one: a notice on the person's own activity topic
 * (MqttMessageType.Desktop_Notice, sent beside every push by the server's
 * business/Notification Deliver). This raises it with `new Notification()`,
 * which the app's notification plugin turns into a native one (TN-BUG-12).
 * Loaded only in the desktop app, and only when a notice comes
 * (hooks/useMqttMessageHandler).
 *
 *   - Each notice once: a redelivery, or the same notice again in this
 *     session, is dropped by its notice_id (the last 200, kept for the session).
 *   - Nothing stale: the broker keeps a session's messages while the app is
 *     away and replays them on reconnect; a notice sent more than two minutes
 *     ago is dropped rather than raised in a burst. The unread counts show
 *     what was missed.
 *   - Nothing about what is in front of the person: with the window visible
 *     and focused, a notice about the conversation or thread in view is
 *     dropped, compared by conversation as the in-app preview is
 *     (lib/utils/notificationOnScreen), never by path.
 *   - Quiet while this device is paused (lib/notifications/pause), as the
 *     preview is; the server already holds pauses, quiet hours and focus time.
 *   - Click-through: the plugin can't tell the page a notification was
 *     clicked, but clicking one brings the app forward. So a notice raised
 *     while the window was hidden or not focused leaves its route behind, and
 *     the window's next focus within 20 seconds opens it. A later notice
 *     replaces it.
 *
 * Title, body and tag only: the plugin hands an icon to the system as a file
 * or icon name, and a link (the sender's avatar) can stop the notification
 * showing at all on Windows. The system shows the app's own icon.
 */
import { notificationRoute, NOTIFICATION_FALLBACK_ROUTE, type PushNotificationData } from "@/lib/utils/notificationRoute"
import { onScreenFrom, pushIsOnScreen } from "@/lib/utils/notificationOnScreen"
import { isPausedHere } from "@/lib/notifications/pause"
import { DESKTOP_OPEN_ROUTE_EVENT, isDesktopApp } from "@/lib/desktopApp"
import store from "@/store/store"

/** A notice as the server sends it (models/mqtt MqttDesktopNotice). */
export interface DesktopNotice {
  notice_id?: string
  /** UTC, with milliseconds. */
  sent_at?: string
  /** The push's own data: type, type_id, thread_id, title, body. */
  data?: PushNotificationData & { title?: string; body?: string }
}

/** A notice older than this is a replay, not news. */
export const NOTICE_MAX_AGE_MS = 2 * 60_000
/** How long after a notice the window's coming back opens it. */
export const CLICK_THROUGH_MS = 20_000

const SEEN_MAX = 200
const SEEN_KEY = "oc_desktop_notices_seen"

let seen: string[] | null = null
let pending: { route: string; at: number } | null = null
let listening = false

function seenIds(): string[] {
  if (seen) return seen
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]")
    seen = Array.isArray(kept) ? kept.filter((x): x is string => typeof x === "string") : []
  } catch {
    seen = []
  }
  return seen
}

function remember(id: string) {
  const ids = seenIds()
  ids.push(id)
  if (ids.length > SEEN_MAX) ids.splice(0, ids.length - SEEN_MAX)
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  } catch {
    /* storage blocked: memory still drops repeats */
  }
}

/** Whether the person is looking at the window. */
function attending(): boolean {
  return document.visibilityState === "visible" && document.hasFocus()
}

/** What the window shows, as the in-app preview reads it. */
function screenNow() {
  const state = store.getState()
  const panel = state.rightPanel.rightPanelState
  return onScreenFrom(window.location.pathname, {
    panes: state.split?.panes ?? [],
    openThread: panel.isOpen ? panel.data.postUUID || panel.data.chatMessageUUID || null : null,
  })
}

/** Opens the route a notice left, when the window comes back soon enough after it. */
function openPending() {
  const p = pending
  pending = null
  if (!p || Date.now() - p.at > CLICK_THROUGH_MS) return
  window.dispatchEvent(new CustomEvent(DESKTOP_OPEN_ROUTE_EVENT, { detail: p.route }))
}

function listen() {
  if (listening) return
  listening = true
  window.addEventListener("focus", openPending)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") openPending()
  })
}

/**
 * Raises a desktop notice (the MQTT message's data), and says whether it did.
 * selfUUID is the reader's, which names a DM's conversation and route.
 */
export function raiseDesktopNotice(notice: unknown, selfUUID?: string): boolean {
  if (!isDesktopApp() || typeof Notification === "undefined") return false
  const n = (notice ?? {}) as DesktopNotice
  const id = typeof n.notice_id === "string" ? n.notice_id : ""
  const data = n.data
  if (!id || !data || typeof data !== "object") return false

  const now = Date.now()
  const sentAt = Date.parse(n.sent_at || "")
  if (!Number.isFinite(sentAt) || now - sentAt > NOTICE_MAX_AGE_MS) return false
  if (seenIds().includes(id)) return false
  remember(id)
  if (isPausedHere(now)) return false

  const looking = attending()
  if (looking && pushIsOnScreen(data, screenNow(), selfUUID)) return false

  try {
    new Notification(data.title || "OneCamp", { body: data.body || "", tag: id })
  } catch {
    return false
  }

  if (!looking) {
    const route = notificationRoute(data, selfUUID)
    // Somewhere to go: the app's home is not a reason to move the person.
    pending = route === NOTIFICATION_FALLBACK_ROUTE ? null : { route, at: now }
    listen()
  }
  return true
}
