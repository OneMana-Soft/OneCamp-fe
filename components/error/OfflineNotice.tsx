"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { isServerUnreachable, noteNetworkOk, subscribeConnectivity } from "@/lib/connectivity"
import { useMqttConnectionState } from "@/components/mqtt/mqttProvider"
import { useUpdateReady } from "@/hooks/useUpdateReady"
import { WifiOff, Zap } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The app's connection state, said once, as one pill (design v3, shell T3).
 *
 * Three things can be true, said in this order of weight:
 *   - the network is gone ("You're offline"), or the server does not answer
 *     while the browser is online ("Can't reach the server"); writes won't
 *     be saved, so a Retry asks again;
 *   - the live connection dropped while the API still works ("Live updates
 *     paused"): it replaces the top bar's connection dot;
 *   - a newer build is out ("A new version is ready", polled from the build
 *     id): Reload, never automatically while somebody is typing. The chunk
 *     error reload (lib/chunkRecovery) stays the fallback.
 *
 * On a desktop the pill sits 8px above the sidebar's foot (FootPill, which
 * hosts it); everywhere else the root's copy floats at the bottom, above a
 * phone's tab bar. The root's copy stands down while the shell's is mounted,
 * so it is said once. The inline notice in the banner slot is gone: the pill
 * is enough.
 */

// How many shells are hosting the pill right now.
let hosts = 0
const hostListeners = new Set<() => void>()
const subscribeHosts = (fn: () => void) => {
  hostListeners.add(fn)
  return () => hostListeners.delete(fn)
}
const hosted = () => hosts > 0
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

function probeServer(onAnswer: () => void) {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!base) return
  fetch(new URL("auth/providers", base), { cache: "no-store", credentials: "omit" })
    .then(onAnswer)
    .catch(() => {})
}

export type ConnectionPill =
  | { kind: "offline"; title: string; line: string }
  | { kind: "live"; title: string }
  | { kind: "update"; title: string }
  | null

/** What the pill should say now, if anything. */
function useConnectionPill(): { pill: ConnectionPill; retry: () => void; reload: () => void } {
  const online = useSyncExternalStore(subscribeOnline, browserOnline, assumeOnline)
  const unreachable = useSyncExternalStore(subscribeConnectivity, isServerUnreachable, assumeReachable)
  const connectionState = useMqttConnectionState()
  const update = useUpdateReady()

  // The live connection only counts as lost after it has been up once, so a
  // page that is still connecting says nothing.
  const [wasLive, setWasLive] = useState(false)
  useEffect(() => {
    if (connectionState?.isConnected) setWasLive(true)
  }, [connectionState?.isConnected])

  // Someone idle on a page makes no requests, so nothing would notice the
  // server coming back. Ask it, cheaply, while it is away.
  useEffect(() => {
    if (!online || !unreachable) return
    let stopped = false
    const probe = () => probeServer(() => { if (!stopped) noteNetworkOk() })
    const timer = window.setInterval(probe, PROBE_EVERY_MS)
    window.addEventListener("focus", probe)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener("focus", probe)
    }
  }, [online, unreachable])

  let pill: ConnectionPill = null
  if (!online) pill = { kind: "offline", title: "You're offline", line: "Changes won't be saved until you're back." }
  else if (unreachable) pill = { kind: "offline", title: "Can't reach the server", line: "Trying again. Nothing you've saved is lost." }
  else if (wasLive && connectionState && !connectionState.isConnected) pill = { kind: "live", title: "Live updates paused · reconnecting" }
  else if (update.ready) pill = { kind: "update", title: "A new version is ready" }

  return { pill, retry: () => probeServer(noteNetworkOk), reload: update.reload }
}

function Pill({ pill, retry, reload, className }: { pill: NonNullable<ConnectionPill>; retry: () => void; reload: () => void; className?: string }) {
  let lead: ReactNode
  let action: ReactNode = null
  const btn = "h-6 shrink-0 rounded-[6px] px-2 text-2xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
  if (pill.kind === "offline") {
    lead = <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    action = <button type="button" onClick={retry} className={cn(btn, "bg-raised text-ink shadow-e1")}>Retry</button>
  } else if (pill.kind === "live") {
    lead = <Zap className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
  } else {
    lead = <span className="shell-footpill-dot" aria-hidden="true" />
    action = <button type="button" onClick={reload} className={cn(btn, "bg-brand text-brand-foreground shadow-primary")}>Reload</button>
  }
  return (
    <div
      role="status"
      aria-live="polite"
      data-connection-pill={pill.kind}
      data-tone={pill.kind === "offline" ? "warn" : undefined}
      className={cn("shell-footpill", className)}
      title={pill.kind === "offline" ? `${pill.title}. ${pill.line}` : undefined}
    >
      {lead}
      <span className="min-w-0 flex-1 truncate">{pill.title}</span>
      {action}
    </div>
  )
}

/** The pill above the sidebar's foot (desktop). It hosts the notice, so the root's copy stands down. */
export function FootPill() {
  useEffect(() => {
    hosts++
    hostListeners.forEach((fn) => fn())
    return () => {
      hosts--
      hostListeners.forEach((fn) => fn())
    }
  }, [])
  const { pill, retry, reload } = useConnectionPill()
  if (!pill) return null
  return <Pill pill={pill} retry={retry} reload={reload} />
}

/** The root's copy: floats bottom-left on a wide screen, above the tab bar on a phone, when no shell hosts the pill. */
export function OfflineNotice() {
  const isHosted = useSyncExternalStore(subscribeHosts, hosted, notHosted)
  const { pill, retry, reload } = useConnectionPill()
  if (!pill || isHosted) return null
  return (
    <Pill
      pill={pill}
      retry={retry}
      reload={reload}
      className="fixed z-[var(--z-toast)] bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] left-1/2 !m-0 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 sm:bottom-4 sm:left-4 sm:max-w-sm sm:translate-x-0"
    />
  )
}
