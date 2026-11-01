// When this page's requests last answered each url (hooks/useFetch); one
// kept from the last visit (lib/swrCache) has none.
const answered = new Map<string, number>()
const told = new Set<(url: string) => void>()

export function noteAnswered(url: string): void {
  answered.set(url, Date.now())
  told.forEach((tell) => tell(url))
}

export const answeredAt = (url: string): number | undefined => answered.get(url)

/** tell hears each url once SWR has stored its answer (the offline engine keeps it: lib/offline/engine). */
export function onAnswered(tell: (url: string) => void): () => void {
  told.add(tell)
  return () => void told.delete(tell)
}

// Who asks the server whose session this is when a change is refused (AppProtectedRoute).
const askers = new Set<() => void>()

/**
 * The server refused a change with a 403 (lib/offline/engine, replaying what
 * waited offline). Usually the member may not make that change; but a member
 * deactivated or removed meanwhile is refused everything, so whoever holds the
 * session asks the server again, and a refusal there signs out.
 */
export function heardRefusal(): void {
  askers.forEach((ask) => ask())
}

export function onRefusal(ask: () => void): () => void {
  askers.add(ask)
  return () => void askers.delete(ask)
}

/**
 * Whether a request never reached the server, or nothing answered: an axios
 * error with no response that wasn't cancelled. Not a refusal: the server has
 * said nothing. Read by shape, so the first load asks it (lib/swrCache
 * keptProfile) without the Offline Store's chunk, whose isNetworkFailure
 * (lib/offline/http) asks it too.
 */
export function unanswered(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { isAxiosError?: unknown; response?: unknown; __CANCEL__?: unknown; code?: unknown }
  return e.isAxiosError === true && !e.response && e.__CANCEL__ !== true && e.code !== "ERR_CANCELED"
}
