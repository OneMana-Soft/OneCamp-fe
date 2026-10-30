type Keys = Record<string, string | null>

/** Keys of the address set, or (null) dropped, in one replaceState, which
 * Next follows: the new search, or null if unchanged. */
function inAddress(key: string, value: string): void
function inAddress(keys: Keys): string | null
function inAddress(keys: string | Keys, value?: string) {
  if (typeof keys == "string") return void inAddress({ [keys]: value ?? null })
  const url = new URL(location.href)
  const q = url.searchParams
  const was = `${q}`
  for (const [k, v] of Object.entries(keys)) {
    if (v === null) q.delete(k)
    else q.set(k, v)
  }
  if (`${q}` === was) return null
  history.replaceState(null, "", url)
  return `${q}`
}

export const useTabInAddress = () => inAddress
