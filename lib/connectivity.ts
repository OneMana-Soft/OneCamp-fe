/**
 * Whether the API is answering, as the requests themselves report it.
 *
 * The browser's navigator.onLine says only whether there is a network, and is
 * often true while the API is down or behind a proxy that answers with an
 * error page (which the browser reports as "Network Error"). So the axios
 * layer reports each request: one that got no answer at all is a miss, and
 * any answer, even an error status, is a hit. Two misses in a row mark the
 * server unreachable; the next answer marks it reachable again.
 *
 * One miss is not enough: a single request aborted by a flaky moment would
 * flash a notice for nothing.
 */

type Listener = () => void

const MISSES_BEFORE_UNREACHABLE = 2

let misses = 0
let unreachable = false
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

/** A request got no answer at all (not an error status: no response). */
export function noteNetworkFailure(): void {
  misses++
  if (!unreachable && misses >= MISSES_BEFORE_UNREACHABLE) {
    unreachable = true
    emit()
  }
}

/** A request got an answer, whatever its status. */
export function noteNetworkOk(): void {
  misses = 0
  if (unreachable) {
    unreachable = false
    emit()
  }
}

export function isServerUnreachable(): boolean {
  return unreachable
}

/**
 * The app's ONE connectivity state: the browser has no network, or the server
 * is unreachable. OfflineNotice says it, and a read that got no answer waits
 * quietly only while it holds (hooks/useFetch).
 */
export function isAppOffline(): boolean {
  return unreachable || (typeof navigator !== "undefined" && navigator.onLine === false)
}

let watching = false

/** Hears every change of isAppOffline: the server's misses and answers, and the browser's network. */
export function subscribeConnectivity(listener: Listener): () => void {
  if (!watching) {
    watching = true
    window.addEventListener("online", emit)
    window.addEventListener("offline", emit)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
