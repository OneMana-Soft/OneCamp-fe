"use client"

/**
 * A table row's comment threads (tables A8; business/TableComments): the
 * threads on the row and its cells, read and written as a doc's are
 * (useThreads, one read and one store), with a comment's edit, removal and
 * reactions through the threads routes that rows' stored comments take
 * (threadsApi), each answering for itself and throwing with the server's
 * message. What a thread card does comes back as the same actions a doc's
 * threads give it, so B7's ThreadCard renders a row's threads unchanged.
 *
 * Live: the table's topic says "comments" for the row (lib/tables/rowComments),
 * and the row's threads are read again.
 */
import { useCallback, useEffect, useMemo } from "react"
import { useDispatch, useStore } from "react-redux"
import { commentChanged, resourceKey } from "@/store/slice/threadsSlice"
import { THREADS_TROUBLE, useThreads } from "@/components/threads/useThreads"
import * as api from "@/components/threads/threadsApi"
import type { ThreadView } from "@/components/threads/types"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { onRowComments } from "@/lib/tables/rowComments"
import type { UserProfileDataInterface } from "@/types/user"
import type { ThreadActions } from "@/components/docComments/useDocThreads"

/** A row as threads name it. */
export const ROW_KIND = "table_row"

type Root = { threads?: { byId: Record<string, ThreadView | undefined> } }

export function useRowThreads(rowId: string, me?: Pick<UserProfileDataInterface, "user_uuid" | "user_name" | "user_profile_object_key">) {
  const dispatch = useDispatch()
  const store = useStore<Root>()
  const resource = useMemo(() => (rowId ? { kind: ROW_KIND, uuid: rowId } : null), [rowId])
  const t = useThreads(resource)
  const key = rowId ? resourceKey(ROW_KIND, rowId) : ""

  // Another tab, or another person, changed the row's threads.
  const { refresh } = t
  useEffect(() => (rowId ? onRowComments(rowId, () => void refresh()) : undefined), [rowId, refresh])

  // The thread a comment is in: the routes name both, and the server checks
  // that the one holds the other.
  const threadOf = useCallback(
    (commentId: string) => {
      const byId = store.getState().threads?.byId ?? {}
      for (const id of Object.keys(byId)) {
        if (byId[id]?.comments.some((c) => c.comment_uuid === commentId)) return id
      }
      throw new Error("That comment isn't here any more.")
    },
    [store],
  )

  const write = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      throw new Error(e instanceof Error && !("response" in e) ? e.message : apiErrorMessage(e, THREADS_TROUBLE))
    }
  }, [])

  const edit = useCallback(
    (commentId: string, html: string) =>
      write(async () => {
        const saved = await api.editThreadComment(threadOf(commentId), commentId, html)
        dispatch(commentChanged({ kind: "edited", key, commentId, html: saved.comment_text ?? html, at: saved.comment_updated_at ?? new Date().toISOString() }))
      }),
    [write, threadOf, dispatch, key],
  )

  const remove = useCallback(
    (commentId: string) =>
      write(async () => {
        await api.removeThreadComment(threadOf(commentId), commentId)
        dispatch(commentChanged({ kind: "removed", key, commentId }))
      }),
    [write, threadOf, dispatch, key],
  )

  /** Adds the person's reaction, or changes their own one's emoji: one a person. */
  const react = useCallback(
    (commentId: string, emojiId: string) =>
      write(async () => {
        const id = await api.reactToThreadComment(threadOf(commentId), commentId, emojiId)
        if (!id || !me) return
        dispatch(
          commentChanged({
            kind: "reacted",
            key,
            commentId,
            reactionId: id,
            emojiId,
            by: { user_uuid: me.user_uuid, user_name: me.user_name, user_profile_object_key: me.user_profile_object_key ?? "" } as UserProfileDataInterface,
            at: new Date().toISOString(),
          }),
        )
      }),
    [write, threadOf, dispatch, key, me],
  )

  const unreact = useCallback(
    (commentId: string, reactionId: string) =>
      write(async () => {
        await api.unreactToThreadComment(threadOf(commentId), commentId, reactionId)
        dispatch(commentChanged({ kind: "unreacted", key, commentId, reactionId }))
      }),
    [write, threadOf, dispatch, key],
  )

  const canModerate = t.threads.some((x) => x.can_moderate)
  const { reply, resolve, reopen, reanchor, markRead } = t
  const actions: ThreadActions = useMemo(
    () => ({ reply, resolve, reopen, reanchor, markRead, edit, remove, react, unreact, canModerate, refresh }),
    [reply, resolve, reopen, reanchor, markRead, edit, remove, react, unreact, canModerate, refresh],
  )

  return { ...t, actions, canModerate }
}
