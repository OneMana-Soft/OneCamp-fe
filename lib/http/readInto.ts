import type { ScopedMutator } from "swr"
import axiosInstance from "@/lib/axiosInstance"

/**
 * Reads `key` now and keeps the answer where useFetch(key) keeps its own, so a
 * row that reads the same key agrees with it (a palette page's choices, read
 * as it opens: linear-28 H1b). The answer is the response body, as useFetch's
 * fetcher stores it. A failed read rejects and leaves what was kept; its toast
 * stays quiet while an error state on screen says it (lib/http/loadFailure).
 * Only lazy parts call it, with the app's own cache (useSWRConfig's mutate).
 */
export async function readInto<T>(mutate: ScopedMutator, key: string): Promise<T> {
  return (await mutate<T>(key, axiosInstance.get<T>(key).then((r) => r.data), { revalidate: false })) as T
}
