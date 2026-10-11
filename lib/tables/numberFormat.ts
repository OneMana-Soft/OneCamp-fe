/**
 * Number formatters, made once per locale and options. `n.toLocaleString(locale,
 * options)` builds a new Intl.NumberFormat on every call, and the grid calls
 * it for every number cell of every row it mounts while scrolling: on a 4x
 * slowed CPU that was most of a scroll frame. Same output, one formatter.
 */
const cache = new Map<string, Intl.NumberFormat>()

export function numberFormat(locale: string | undefined, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, options)
    cache.set(key, f)
  }
  return f
}

/** n.toLocaleString(locale, options), with a cached formatter. */
export function formatLocale(n: number, options: Intl.NumberFormatOptions, locale?: string): string {
  return numberFormat(locale, options).format(n)
}
