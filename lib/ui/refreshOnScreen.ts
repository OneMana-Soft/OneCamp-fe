import { appMutate } from "@/lib/swrMutate"

/**
 * What a pull to refresh asks again (design v3, mobile L4): every list on
 * screen, that is each SWR key with a hook mounted (the rest have nothing
 * listening and are left alone), through the app's own mutate, never SWR's
 * global one (that only knows the default cache; lib/swrMutate). Offline, it
 * fails at once, and the ring says so.
 */
export async function refreshOnScreen(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline")
  await appMutate((key) => typeof key === "string" && key.length > 0)
}
