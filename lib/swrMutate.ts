import { mutate as globalMutate, type ScopedMutator } from "swr"

/**
 * The app's SWR mutate, bound to its cache.
 *
 * The app's data lives in a custom cache (the localStorage provider in
 * ClientProviders). SWR's global `mutate`, imported from "swr", only knows the
 * DEFAULT cache, so every call to it from outside a component revalidated a
 * cache nothing reads: live channel updates, GitHub sync status, unread counts
 * and poll results all arrived over MQTT and changed nothing on screen. SWR's
 * docs say as much: with a custom provider, use the mutate from useSWRConfig.
 *
 * Non-component code (MQTT handlers, services) cannot call that hook, so
 * SWRMutateBridge stores it here once, inside the provider. Before the bridge
 * has mounted there is no app cache to revalidate yet, and the global one is
 * the harmless fallback.
 */
let bound: ScopedMutator | null = null

export function bindAppMutate(m: ScopedMutator | null) {
  bound = m
}

export const appMutate: ScopedMutator = ((...args: Parameters<ScopedMutator>) =>
  (bound ?? globalMutate)(...args)) as ScopedMutator
