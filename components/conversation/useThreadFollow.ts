"use client"

import { useCallback } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { refreshFollowedLists, setFollowing, threadFollowKey, type ThreadChoice } from "@/lib/conversation/threadFollow"
import { apiErrorMessage } from "@/lib/utils/apiError"

/** One thread's standing as a control reads and changes it. */
export interface ThreadFollow {
  /** Whether the reader follows it now; undefined until known. */
  following?: boolean
  /** True while the standing is first being read. */
  loading: boolean
  /** What choosing it does: "Follow thread" or "Unfollow thread". */
  label: string
  /** Follows or unfollows it: at once on screen, put back with a toast when the server says no. */
  toggle: () => Promise<void>
}

/**
 * The reader's standing in the thread rooted at root (chat P2): whether they
 * follow it, and following or unfollowing it. Nothing is read for no root.
 */
export function useThreadFollow(root: string | undefined): ThreadFollow {
  const key = root ? threadFollowKey(root) : ""
  const { data, mutate, isLoading } = useFetch<{ data: ThreadChoice }>(key, undefined, undefined, OWN_ERRORS)
  const { toast } = useToast()
  const following = data?.data?.following

  const toggle = useCallback(async () => {
    // Whether the reader follows isn't known while the standing loads: a tap then must not guess.
    if (!root || isLoading) return
    const on = !following
    const before = data
    void mutate({ data: { root, following: on, follow: on ? "on" : "off" } }, { revalidate: false })
    try {
      const next = await setFollowing(root, on)
      void mutate({ data: next }, { revalidate: false })
      void refreshFollowedLists()
    } catch (error) {
      void mutate(before, { revalidate: true })
      toast({
        title: on ? "Couldn't follow the thread" : "Couldn't unfollow the thread",
        description: apiErrorMessage(error, "Try again in a moment."),
        variant: "destructive",
      })
    }
  }, [root, isLoading, following, data, mutate, toast])

  return { following, loading: !!isLoading, label: following ? "Unfollow thread" : "Follow thread", toggle }
}
