import type { SWRConfiguration } from "swr"

/**
 * A read of a url another hook on screen asks for: it shows that hook's
 * answers as they come and never asks itself, so the asker keeps what only it
 * records (useFetch's lastRequestStartedAt, which useConversation's latest
 * page merges by).
 *
 * Only while the asker is there first: SWR refreshes a url, on focus, on
 * reconnect and on a mutate, through the first hook that subscribed to it. A
 * reader there before the asker turns the url's focus and reconnect refreshes
 * off and runs its own fetcher on a mutate, so subscribe one only where the
 * asker has subscribed, or will, ahead of it.
 */
export const CACHE_ONLY: SWRConfiguration = { revalidateOnMount: false, revalidateIfStale: false, revalidateOnFocus: false, revalidateOnReconnect: false }
