"use client"

import { useEffect, useSyncExternalStore } from "react"
import { isServerUnreachable, noteNetworkOk, subscribeConnectivity } from "@/lib/connectivity"
import { NoticeBar } from "@/components/banner/NoticeBar"

/**
 * The app's offline state: one quiet notice while the network is gone or the
 * server doesn't answer, gone as soon as it does.
 *
 * There was none. With the network down, reads failed into empty lists or
 * "Couldn't load" boxes and writes failed in silence, so nothing said the one
 * true thing: you're offline, and what you change now won't be saved.
 *
 * Two causes, said differently. The browser's own "offline" is the person's
 * network. Requests that get no answer while the browser says online
 * (lib/connectivity, fed by the axios layer) are the server or a proxy in
 * front of it, which a person can't fix, so it says it is trying again.
 *
 * Inside the signed-in app it is a line in the shell's notice slot, above the
 * page, taking its own height: it covers nothing. Floating bottom left, it sat
 * on the sidebar's Collapse button (and over the sheet's edge); on a phone it
 * floated over the page above the tab bar. Outside the app (sign-in, a shared
 * form) there is no slot, and the root's copy floats as before. The root's
 * copy stands down while the shell's is mounted, so it is said once.
 */

// How many shells are showing the notice inline right now.
let inlineHosts = 0
const hostListeners = new Set<() => void>()
const subscribeHosts = (fn: () => void) => {
  hostListeners.add(fn)
  return () => hostListeners.delete(fn)
}
const hostedInline = () => inlineHosts > 0
const notHosted = () => false

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}
const browserOnline = () => navigator.onLine
const assumeOnline = () => true
const assumeReachable = () => false

/** How often the server is asked again while it doesn't answer. */
const PROBE_EVERY_MS = 15_000

export function OfflineNotice({ inline = false }: { inline?: boolean } = {}) {
  const hosted = useSyncExternalStore(subscribeHosts, hostedInline, notHosted)
  useEffect(() => {
    if (!inline) return
    inlineHosts++
    hostListeners.forEach((fn) => fn())
    return () => {
      inlineHosts--
      hostListeners.forEach((fn) => fn())
    }
  }, [inline])
  const online = useSyncExternalStore(subscribeOnline, browserOnline, assumeOnline)
  const unreachable = useSyncExternalStore(subscribeConnectivity, isServerUnreachable, assumeReachable)

  // Someone idle on a page makes no requests, so nothing would notice the
  // server coming back. Ask it, cheaply, while it is away.
  useEffect(() => {
    if (!online || !unreachable) return
    const base = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!base) return
    let stopped = false
    const probe = () => {
      fetch(new URL("auth/providers", base), { cache: "no-store", credentials: "omit" })
        .then(() => {
          if (!stopped) noteNetworkOk()
        })
        .catch(() => {})
    }
    const timer = window.setInterval(probe, PROBE_EVERY_MS)
    window.addEventListener("focus", probe)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener("focus", probe)
    }
  }, [online, unreachable])

  if (online && !unreachable) return null
  if (!inline && hosted) return null

  const title = online ? "Can't reach the server" : "You're offline"
  const line = online
    ? "Trying again. Nothing you've saved is lost."
    : "Changes you make won't be saved until you're back."

  if (inline) {
    return (
      <NoticeBar tone="offline">
        <span className="font-medium">{title}.</span> {line}
      </NoticeBar>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[var(--z-toast)] bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-1/2 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2.5 rounded-lg border border-border bg-popover px-3 py-2 text-foreground shadow-overlay motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 sm:bottom-4 sm:left-4 sm:max-w-sm sm:translate-x-0"
    >
      {/* A real state, so a dot in the warning colour: the words carry it too. */}
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5">{title}</p>
        <p className="text-xs text-muted-foreground">{line}</p>
      </div>
    </div>
  )
}
