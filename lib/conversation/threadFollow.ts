import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { isThreadsKey, CHAT_THREADS_PATH } from "@/lib/conversation/threadsKey"
import { appMutate, patchCached } from "@/lib/swrMutate"

// Following one thread and reading it (chat P2): apart from the Threads tab's
// own code (lib/conversation/threads), for a message's menu and a thread's header.

/** Someone's standing in one thread: auto follows while they take part, on whatever their part, off never. */
export interface ThreadChoice {
  root: string
  following: boolean
  follow: "auto" | "on" | "off"
}

/** The key one thread's standing is cached under. Pure. */
export function threadFollowKey(root: string): string {
  return root ? `${CHAT_THREADS_PATH}/${encodeURIComponent(root)}/follow` : ""
}

/** Follows the thread rooted at root whatever the reader's part (on), or never (off), and answers their standing. */
export async function setFollowing(root: string, on: boolean): Promise<ThreadChoice> {
  const res = await axiosInstance.put<{ data: ThreadChoice }>(threadFollowKey(root), { follow: on ? "on" : "off" }, OWN_ERRORS)
  return res.data.data
}

/** Marks the thread rooted at root read to now, or its latest reply unread. */
export async function setThreadRead(root: string, read: boolean): Promise<void> {
  await axiosInstance.put(`${CHAT_THREADS_PATH}/${encodeURIComponent(root)}/read`, { read }, OWN_ERRORS)
}

/** Reads the Threads tab and its count again (every threads read but a thread's own standing). */
export function refreshFollowedLists(): Promise<unknown> {
  return appMutate((key: unknown) => isThreadsKey(key) && !String(key).endsWith("/follow"))
}

/**
 * You follow a thread once you've replied in it (business/ChatThread): its
 * cached standing says so at once, unless you turned the thread off by hand,
 * which still wins.
 */
export function followsOnReply(root: string): void {
  patchCached<{ data?: ThreadChoice }>(threadFollowKey(root), (env) =>
    env?.data && !env.data.following && env.data.follow !== "off" ? { ...env, data: { ...env.data, following: true } } : env,
  )
}
