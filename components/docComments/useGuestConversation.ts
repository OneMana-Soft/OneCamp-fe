"use client"

/**
 * A doc's conversation with its guests and its latest client verdict (docs
 * C5-2): one read each, which SWR shares between the comment lists (to know
 * whether the whole panel is empty) and the conversation under them.
 */

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { docVerdictKey, guestThreadKey, type DocVerdict, type GuestThread } from "@/lib/guestThread/guestThread"

export function useGuestConversation(docId: string) {
  const thread = useFetch<{ data?: GuestThread }>(guestThreadKey(docId), undefined, undefined, OWN_ERRORS)
  const verdict = useFetch<{ data?: { review?: DocVerdict | null } }>(docVerdictKey(docId), undefined, undefined, OWN_ERRORS)
  return { thread, verdict }
}

/**
 * Whether the doc's guests have said anything, a comment or a verdict;
 * undefined until both reads answer, and while one has failed (the
 * conversation then shows its error, so the panel isn't empty either).
 */
export function guestsSpoke({ thread, verdict }: ReturnType<typeof useGuestConversation>): boolean | undefined {
  if (!thread.data || !verdict.data) return undefined
  return (thread.data.data?.comments?.length ?? 0) > 0 || !!verdict.data.data?.review
}
