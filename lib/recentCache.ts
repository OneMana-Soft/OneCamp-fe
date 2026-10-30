/**
 * A Map that forgets the entries read or written least recently beyond its
 * limit: the app's responses (lib/swrCache's MemberCache) and what a doc's
 * export consent has heard (lib/workspaceExport/consent). Its own module, so
 * the editor, which carries the consent, doesn't bring the response cache.
 */

/** Entries kept: a screen reads a few dozen responses; this is many screens. */
export const MAX_ENTRIES = 300

/**
 * Forgets what was read or written least recently beyond its limit. What is
 * on screen is read on every render, so it stays; a response read again after
 * being forgotten is fetched again, as on a first visit.
 *
 * Reading never reorders the Map: SWR walks the cache's keys while it reads
 * entries (a global mutate does), and a Map walk visits a key that is moved to
 * the end again, so moving on read made that walk endless and froze the page.
 * Recency is kept beside the Map instead.
 */
export class RecentCache<V> extends Map<string, V> {
  private readonly used = new Map<string, number>()
  private clock = 0

  constructor(entries: Iterable<readonly [string, V]> = [], private readonly limit = MAX_ENTRIES) {
    super()
    for (const [k, v] of entries) this.set(k, v)
  }

  get(key: string): V | undefined {
    if (super.has(key)) this.used.set(key, ++this.clock)
    return super.get(key)
  }

  set(key: string, value: V): this {
    super.set(key, value)
    this.used.set(key, ++this.clock)
    if (this.limit) {
      while (this.size > this.limit) {
        let oldest: string | undefined
        let at = Infinity
        for (const [k, t] of this.used) if (t < at && k !== key) (at = t), (oldest = k)
        if (oldest === undefined) break
        this.delete(oldest)
      }
    }
    return this
  }

  delete(key: string): boolean {
    this.used.delete(key)
    return super.delete(key)
  }

  clear(): void {
    this.used.clear()
    super.clear()
  }

  /** Keys, most recently read or written first. */
  recentFirst(): string[] {
    return [...this.used.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }
}
