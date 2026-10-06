/**
 * Messages are kept in memory for the conversations opened most recently,
 * and forgotten for the rest. Every channel, DM and group opened used to stay
 * loaded, with every older page scrolled back to, until the tab was closed. A
 * conversation opened again after being forgotten loads its latest messages,
 * as it does on a first visit.
 */
export const LOADED_CONVERSATIONS = 8

/**
 * Marks `id` as just loaded and drops the lists of the conversations loaded
 * least recently beyond `limit`. Works on an Immer draft or plain objects.
 */
export function keepRecentlyLoaded<T>(lists: Record<string, T[]>, order: string[], id: string, limit = LOADED_CONVERSATIONS): void {
  const at = order.indexOf(id)
  if (at >= 0) order.splice(at, 1)
  order.push(id)
  while (order.length > limit) {
    const oldest = order.shift()!
    delete lists[oldest]
  }
}
