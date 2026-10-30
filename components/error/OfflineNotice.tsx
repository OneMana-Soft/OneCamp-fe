"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { useHostPill, usePillHosted, usePillStoodIn } from "@/components/error/pillPlace"
import { isServerUnreachable, noteNetworkOk, subscribeConnectivity } from "@/lib/connectivity"
import { useMqttConnectionState, useMqttReconnect } from "@/components/mqtt/mqttContext"
import { FAST_RECONNECT_TRIES } from "@/lib/mqtt/reconnectDelay"
import { useUpdateReady } from "@/hooks/useUpdateReady"
import { isSchemaOutdated, subscribeSchemaOutdated } from "@/lib/schemaOutdated"
import { WifiOff, Zap } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { emptyOfflineStatus, getOfflineStatus, reviewOfflineChanges, sendOfflineChangesNow, subscribeOfflineStatus } from "@/lib/offline/status"

/**
 * The app's connection state, said once, as one pill (design v3, shell T3).
 *
 * Three things can be true, said in this order of weight:
 *   - the network is gone ("You're offline"), or the server does not answer
 *     while the browser is online ("Can't reach the server"); writes won't
 *     be saved, so a Retry asks again;
 *   - the live connection dropped while the API still works ("Live updates
 *     paused"): it replaces the top bar's connection dot. It never stops
 *     trying (lib/mqtt/reconnectDelay); once the fast tries are spent it says
 *     it tries every 30 seconds, and offers Reconnect to try now;
 *   - a newer build is out ("A new version is ready", polled from the build
 *     id): Reload, never automatically while somebody is typing. The chunk
 *     error reload (lib/chunkRecovery) stays the fallback. When the
 *     collaboration server says this tab's editor is older than its own, it
 *     has opened the doc read-only, so the pill says so first: "A newer
 *     version of OneCamp is ready. Reload to keep editing" (lib/schemaOutdated).
 *
 *
 * With the Offline Store (lib/offline, projects P7-1) it also says what is
 * waiting: offline, how many changes are kept on this device; back online,
 * that they are being sent; and when some need the member (a teammate changed
 * the same field, the server keeps failing one, or one can't be sent), how
 * many, with Review.
 *
 * On a desktop the pill sits 8px above the sidebar's foot (FootPill, which
 * hosts it); everywhere else the root's copy floats at the bottom, above a
 * phone's tab bar. The root's copy stands down while the shell's is mounted,
 * so it is said once. The inline notice in the banner slot is gone: the pill
 * is enough.
 */

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
const notOutdated = () => false

/** How often the server is asked again while it doesn't answer. */
const PROBE_EVERY_MS = 15_000

function probeServer(onAnswer: () => void) {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL
  if (!base) return
  fetch(new URL("auth/providers", base), { cache: "no-store", credentials: "omit" })
    .then(onAnswer)
    .catch(() => {})
}

/** A pill's title says what's off; its detail, what follows from it (the changes waiting, the tries). */
export type ConnectionPill =
  | { kind: "offline"; title: string; detail?: string; line: string }
  | { kind: "review"; title: string }
  | { kind: "sync"; title: string }
  | { kind: "waiting"; title: string }
  | { kind: "live"; title: string; detail: string; waiting: boolean }
  | { kind: "update"; title: string }
  | null

/** What the pill should say now, if anything. */
function useConnectionPill(): { pill: ConnectionPill; retry: () => void; reload: () => void; reconnect?: () => void } {
  const online = useSyncExternalStore(subscribeOnline, browserOnline, assumeOnline)
  const unreachable = useSyncExternalStore(subscribeConnectivity, isServerUnreachable, assumeReachable)
  const connectionState = useMqttConnectionState()
  const reconnect = useMqttReconnect()
  const update = useUpdateReady()
  const schemaOutdated = useSyncExternalStore(subscribeSchemaOutdated, isSchemaOutdated, notOutdated)
  const kept = useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus, emptyOfflineStatus)

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

  const waiting = kept.waiting
  const changes = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`
  const needYou = kept.conflicts.length + kept.failed.length + kept.held.length
  let pill: ConnectionPill = null
  if (!online || unreachable) {
    const title = !online ? "You're offline" : "Can't reach the server"
    const detail = `${changes(waiting)} waiting`
    if (kept.full) pill = { kind: "offline", title, detail, line: "That's as many as this device keeps. New changes can't be kept until these are sent." }
    else if (waiting > 0) pill = { kind: "offline", title, detail, line: "Kept on this device. They're sent when you're back." }
    else if (!online) pill = { kind: "offline", title, line: "Changes to tasks are kept on this device. Other changes can't be saved until you're back." }
    else pill = { kind: "offline", title, line: "Trying again. Nothing you've saved is lost." }
  }
  else if (needYou > 0) pill = { kind: "review", title: `${changes(needYou)} ${needYou === 1 ? "needs" : "need"} you` }
  else if (kept.sending && waiting > 0) pill = { kind: "sync", title: `Sending ${changes(waiting)}…` }
  // A change kept after a failed send, before the server counts as unreachable
  // (two misses, lib/connectivity): an idle page asks nothing more, so the
  // change would wait unseen (DESIGN-BUILD-21 M2). Kept means said.
  else if (waiting > 0) pill = { kind: "waiting", title: `${changes(waiting)} waiting` }
  else if (schemaOutdated) pill = { kind: "update", title: "A newer version of OneCamp is ready. Reload to keep editing" }
  else if (wasLive && connectionState && !connectionState.isConnected) {
    // Past the fast tries the waits are 30 s long: say so, and offer to try now.
    const waiting = (connectionState.reconnectAttempts ?? 0) >= FAST_RECONNECT_TRIES
    pill = { kind: "live", title: "Live updates paused", detail: waiting ? "trying every 30 s" : "reconnecting", waiting }
  }
  else if (update.ready) pill = { kind: "update", title: "A new version is ready" }

  // Retry asks the server, and sends what's waiting on the device now.
  const retry = () => {
    probeServer(noteNetworkOk)
    sendOfflineChangesNow()
  }
  return { pill, retry, reload: update.reload, reconnect }
}

function Pill({ pill, retry, reload, reconnect, className }: { pill: NonNullable<ConnectionPill>; retry: () => void; reload: () => void; reconnect?: () => void; className?: string }) {
  let lead: ReactNode
  let action: ReactNode = null
  const btn = "h-6 shrink-0 rounded-[6px] px-2 text-2xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
  if (pill.kind === "offline") {
    lead = <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    action = <button type="button" onClick={retry} className={cn(btn, "bg-raised text-ink shadow-e1")}>Retry</button>
  } else if (pill.kind === "review") {
    lead = <span className="shell-footpill-dot" aria-hidden="true" />
    action = <button type="button" onClick={() => reviewOfflineChanges()} className={cn(btn, "bg-brand text-brand-foreground shadow-primary")}>Review</button>
  } else if (pill.kind === "sync") {
    // Neutral: the brand's dot is for what needs the member (Review, Reload).
    lead = <span className="shell-footpill-dot" data-quiet="" aria-hidden="true" />
  } else if (pill.kind === "waiting") {
    lead = <span className="shell-footpill-dot" data-quiet="" aria-hidden="true" />
    action = <button type="button" onClick={retry} className={cn(btn, "bg-raised text-ink shadow-e1")}>Retry</button>
  } else if (pill.kind === "live") {
    lead = <Zap className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
    if (pill.waiting && reconnect) {
      action = <button type="button" onClick={reconnect} className={cn(btn, "bg-raised text-ink shadow-e1")}>Reconnect</button>
    }
  } else {
    lead = <span className="shell-footpill-dot" aria-hidden="true" />
    action = <button type="button" onClick={reload} className={cn(btn, "bg-brand text-brand-foreground shadow-primary")}>Reload</button>
  }
  const detail = pill.kind === "offline" || pill.kind === "live" ? pill.detail : undefined
  const said = detail ? `${pill.title} · ${detail}` : pill.title
  return (
    <div
      role="status"
      aria-live="polite"
      data-connection-pill={pill.kind}
      data-tone={pill.kind === "offline" ? "warn" : undefined}
      className={cn("shell-footpill", className)}
      title={pill.kind === "offline" ? `${said}. ${pill.line}` : pill.kind === "waiting" ? `${said}. Kept on this device, and sent when the server answers.` : said}
    >
      {lead}
      {/* Wrapped, never cut (DESIGN-BUILD-19): the detail takes a line of its own; read as one line. */}
      <span className="min-w-0 flex-1 text-pretty [overflow-wrap:anywhere]">
        {pill.title}
        {detail && (
          <>
            <span className="sr-only"> · </span>
            <span className="block text-ink-3">{detail}</span>
          </>
        )}
      </span>
      {action}
    </div>
  )
}

/** The pill above the sidebar's foot (desktop). It hosts the notice, so the root's copy stands down. */
export function FootPill() {
  useHostPill()
  const { pill, retry, reload, reconnect } = useConnectionPill()
  if (!pill) return null
  return <Pill pill={pill} retry={retry} reload={reload} reconnect={reconnect} />
}

/**
 * The root's copy: floats bottom-left on a wide screen and, on a phone, 8px
 * above what owns the screen's foot (--phone-floor: the tab bar, a composer;
 * a call's dock, --call-dock-floor), as a toast does, when no shell hosts the
 * pill. It sat over a task's composer (DESIGN-BUILD-21 M1). Bottom-left of the sheet, past the
 * shell's own left edge (--shell-left-inset: the tablet's 72px rail), not
 * over it. With the corner cards: over the page, under a sheet or a dialog
 * opened on top, whose foot it covered (a failed menu's Try again).
 */
export function OfflineNotice() {
  const isHosted = usePillHosted()
  // A notice says what the pill would, in its place on a phone (pillPlace.useStandInForPill).
  const stoodIn = usePillStoodIn()
  const { pill, retry, reload, reconnect } = useConnectionPill()
  if (!pill || isHosted) return null
  return (
    <Pill
      pill={pill}
      retry={retry}
      reload={reload}
      reconnect={reconnect}
      className={cn(
        "fixed z-[var(--z-corner)] bottom-[max(calc(var(--phone-floor)+8px),var(--call-dock-floor,0px))] left-1/2 !m-0 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 sm:bottom-4 sm:left-[calc(var(--shell-left-inset,0px)+16px)] sm:max-w-sm sm:translate-x-0",
        stoodIn && "max-sm:hidden",
      )}
    />
  )
}
