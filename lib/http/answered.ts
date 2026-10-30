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
