/**
 * Reads a list the server pages by offset and limit: page after page from
 * `from` until offset `to`, or until a page comes back short, which is the
 * list's end. `concurrency` pages are asked for at once. The items come back
 * in the list's order, as the server gave them; a list that changes while it
 * is read may give an item twice where two pages meet, so callers keyed by id
 * drop repeats.
 */
export async function readPages<T>(
  read: (offset: number, limit: number) => Promise<T[]>,
  {
    pageSize,
    from = 0,
    to = Infinity,
    concurrency = 1,
    onProgress,
    signal,
  }: {
    pageSize: number
    from?: number
    /** Where to stop: the offset after the last item wanted. */
    to?: number
    concurrency?: number
    /** After each round of pages: how many items have been read. */
    onProgress?: (read: number) => void
    signal?: AbortSignal
  },
): Promise<{ items: T[]; ended: boolean }> {
  const items: T[] = []
  let offset = from
  while (offset < to) {
    if (signal?.aborted) throw new DOMException("The read was stopped", "AbortError")
    const round: { offset: number; limit: number }[] = []
    for (let i = 0; i < Math.max(1, concurrency) && offset < to; i++) {
      const limit = Math.min(pageSize, to - offset)
      round.push({ offset, limit })
      offset += limit
    }
    const pages = await Promise.all(round.map((p) => read(p.offset, p.limit)))
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i] ?? []
      items.push(...page)
      if (page.length < round[i].limit) {
        onProgress?.(items.length)
        return { items, ended: true }
      }
    }
    onProgress?.(items.length)
  }
  return { items, ended: false }
}
