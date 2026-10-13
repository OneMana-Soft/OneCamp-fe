/**
 * The OneCamp desktop app (OneMana-Soft/OneCamp-desktop): a Tauri window on the
 * person's workspace, with Tauri's global API on (withGlobalTauri), so the
 * workspace's pages see window.__TAURI__. Its webview has no web push, so the
 * app hears of messages through desktop notices (lib/desktopNotices) and raises
 * them with its notification plugin, which stands in for window.Notification.
 */

/** Whether this page runs inside the desktop app. */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window
}

/**
 * Asks the app to open a route (event.detail): a desktop notice sends it when
 * the person comes back to the window after one (lib/desktopNotices), and the
 * app's router follows it (components/fcm/FCMHandler).
 */
export const DESKTOP_OPEN_ROUTE_EVENT = "onecamp:desktop-open-route"
