import { appMutate } from "@/lib/swrMutate"

// Threads you follow's reads (chat P2), apart from lib/conversation/threads:
// the realtime handler every route carries refreshes them after a reply.
export const CHAT_THREADS_PATH = "/chat-threads"
export const THREADS_UNREAD_KEY = `${CHAT_THREADS_PATH}/unread`

/** Whether an SWR key is a threads read: a page, the count or a thread's standing. Pure. */
export function isThreadsKey(key: unknown): boolean {
  return typeof key === "string" && (key === CHAT_THREADS_PATH || key.startsWith(`${CHAT_THREADS_PATH}?`) || key.startsWith(`${CHAT_THREADS_PATH}/`))
}

let soon: ReturnType<typeof setTimeout> | null = null

/** Refreshes the threads reads a moment after a reply, once for a burst; only what's on screen asks the server. */
export function refreshThreadsSoon(waitMs = 1500): void {
  if (soon) return
  soon = setTimeout(() => {
    soon = null
    void appMutate(isThreadsKey)
  }, waitMs)
}
