"use client"

import { useEffect, useMemo } from "react"

/**
 * What a conversation's list needs to page back through its history, beyond
 * asking for each older page (SD-BUG-5, SD-BUG-1):
 * - whether older messages may exist starts from the latest page's has_more,
 *   so a conversation shorter than a page never asks for one that page said
 *   isn't there;
 * - an older page that failed gives the list its Try again. "Has more" stays
 *   as it was until an answer says otherwise: it was turned off as each page
 *   was asked for, so a failure left the list saying the conversation began
 *   there, and it stopped asking.
 *
 * `asking` is whether an older page has been asked for and not yet answered;
 * `older` is that request (SWR).
 */
export function useOlderPages({
  latestHasMore,
  setHasMore,
  asking,
  older,
}: {
  latestHasMore: boolean | undefined
  setHasMore: (more: boolean) => void
  asking: boolean
  older: { isError?: unknown; mutate: () => unknown }
}): (() => void) | undefined {
  useEffect(() => {
    if (typeof latestHasMore === "boolean") setHasMore(latestHasMore)
  }, [latestHasMore, setHasMore])

  const { isError, mutate } = older
  return useMemo(() => (asking && isError ? () => void mutate() : undefined), [asking, isError, mutate])
}
