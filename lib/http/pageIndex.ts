import { readPages } from "@/lib/http/readPages"

/**
 * Every item of a list the server pages by index (?pageIndex=&pageSize=, the
 * server's helpers.ListPaging), read with readPages: page after page until one
 * comes back short, up to `maxPages`. readPages asks by offset; page n starts
 * at n × pageSize, and every page asked for is pageSize long. An item two
 * pages both gave (the list changed while it was read) is kept once, by
 * `key`; one without a key is left out. `ended` is false when the list went
 * on past `maxPages`.
 */
export async function readEveryByIndex<T>(
  read: (pageIndex: number, pageSize: number) => Promise<T[]>,
  { pageSize, maxPages, key }: { pageSize: number; maxPages: number; key: (item: T) => string | null | undefined },
): Promise<{ items: T[]; ended: boolean }> {
  const { items, ended } = await readPages((offset, limit) => read(offset / pageSize, limit), { pageSize, to: pageSize * maxPages })
  const seen = new Set<string>()
  return {
    items: items.filter((item) => {
      const k = key(item)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    }),
    ended,
  }
}
