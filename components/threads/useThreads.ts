"use client"

/**
 * useThreads: a resource's anchored threads, and what a person does with them
 * (docs programme A8; B7 made it the only place a doc's comments are kept).
 * The threads live in the store by id (threadsSlice); every write puts the
 * server's answer there, so an echo that came first changes nothing.
 *
 * Here: starting a thread, replying, resolving, reopening, reattaching and
 * marking read. Editing, deleting and reacting to a comment go through the
 * resource's own comment routes (for a doc, components/docComments/useDocThreads),
 * and land here as commentChanged, by the comment's id.
 *
 * One read and one live subscription per resource, however many parts of the
 * page show its threads (the margin, the doc's overlay, the panel): a part
 * that mounts reads the list only when nobody has lately. Live, for a doc:
 * - A6's thread events (lib/docMeta, on the doc's own topic) name a thread:
 *   created, replied, resolved, reopened or reattached. That thread is read
 *   again by its id, unless the store already holds what the event says (the
 *   comment it names, the status it gives), as it does for this tab's own write.
 * - The doc's comment events (lib/docComments/events) change a comment by its
 *   id: an edit, a delete, a reaction. A comment written that no thread holds
 *   a moment later (written the old way, as a page comment) has the list read
 *   again, once.
 *
 * An error is an error, never an empty list (I19): status 'error' with the
 * server's message. Writes throw with the server's message for the person.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'
import type { Dispatch } from '@reduxjs/toolkit'
import type { Anchor } from '@/lib/anchors/types'
import threadsSlice, {
  commentAdded,
  commentChanged,
  resourceKey,
  threadGone,
  threadPatched,
  threadRead,
  threadsFailed,
  threadsLoaded,
  threadsRequested,
  threadUpserted,
  type ThreadsState,
} from '@/store/slice/threadsSlice'
import { injectSlice } from '@/store/store'
import * as api from './threadsApi'
import { onDocMeta } from '@/lib/docMeta/bus'
import { onDocCommentEvent } from '@/lib/docComments/events'
import type { UserProfileDataInterface } from '@/types/user'
import type { Thread, ThreadBody, ThreadResource, ThreadView } from './types'

// The threads join the store with the threads UI (a doc's overlay or panel),
// never with every page (store/lazySlices.ts).
injectSlice(threadsSlice)

const NONE: ThreadView[] = []

type Root = { threads?: ThreadsState }
type GetState = () => Root

/** What the server said, for the person, or a plain fallback. */
export function messageOf(e: unknown): string {
  const msg = (e as { response?: { data?: { msg?: unknown } } })?.response?.data?.msg
  return typeof msg === 'string' && msg ? msg : 'Something went wrong. Try again in a moment.'
}

const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status

/** A list read no older than this is not asked for again when another part mounts. */
const FRESH_MS = 30_000
/** How long a comment written elsewhere may wait for its thread's own event before the list is read again. */
const NEW_COMMENT_GRACE_MS = 1_500

// Per resource: the newest list read's number (only it counts) and when it was asked for.
const newest = new Map<string, number>()
const askedAt = new Map<string, number>()

/** Reads a resource's threads; only the newest read for it counts. */
async function readList(res: ThreadResource, dispatch: Dispatch, getState: GetState): Promise<void> {
  const key = resourceKey(res.kind, res.uuid)
  const mine = (newest.get(key) ?? 0) + 1
  newest.set(key, mine)
  const requestedAt = Date.now()
  askedAt.set(key, requestedAt)
  // The comment changes made after this are applied to what it reads.
  const changesSeen = getState().threads?.changesSeen
  dispatch(threadsRequested({ key }))
  try {
    const list = await api.listThreads(res)
    if (newest.get(key) === mine) dispatch(threadsLoaded({ key, threads: list, requestedAt, changesSeen }))
  } catch (e) {
    if (newest.get(key) === mine) dispatch(threadsFailed({ key, error: messageOf(e) }))
  }
}

/** Reads one thread again: the event that named it is the news. Gone when the API no longer has it. */
async function readThread(id: string, dispatch: Dispatch): Promise<void> {
  try {
    dispatch(threadUpserted({ thread: await api.getThread(id), at: Date.now() }))
  } catch (e) {
    if (statusOf(e) === 404) dispatch(threadGone({ id }))
    // Otherwise the next event, or the next read, catches up.
  }
}

/** A doc's live threads: its thread events and its comment events, into the store. */
function startLive(docId: string, dispatch: Dispatch, getState: GetState): () => void {
  const res: ThreadResource = { kind: 'doc', uuid: docId }
  const key = resourceKey('doc', docId)
  const held = (commentId: string) => {
    const s = getState().threads
    return !!s?.byResource[key]?.ids.some((id) => s.byId[id]?.comments.some((c) => c.comment_uuid === commentId))
  }

  const offMeta = onDocMeta(docId, (e) => {
    if (!e.kind.startsWith('thread.')) return
    const id = e.data?.thread_id
    if (!id) {
      void readList(res, dispatch, getState)
      return
    }
    const t = getState().threads?.byId[id]
    if (t) {
      const comment = e.data?.comment_id
      if ((e.kind === 'thread.created' || e.kind === 'thread.replied') && comment && t.comments.some((c) => c.comment_uuid === comment)) return
      if ((e.kind === 'thread.resolved' || e.kind === 'thread.reopened') && e.data?.status === t.status) return
    }
    void readThread(id, dispatch)
  })

  // Comments written that no thread held yet, read for together after a moment.
  const waiting = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const offComments = onDocCommentEvent(docId, (e) => {
    switch (e.kind) {
      case 'created':
        if (held(e.commentId)) return
        waiting.add(e.commentId)
        timer ??= setTimeout(() => {
          timer = null
          const missing = [...waiting].some((id) => !held(id))
          waiting.clear()
          if (missing) void readList(res, dispatch, getState)
        }, NEW_COMMENT_GRACE_MS)
        return
      case 'edited':
        dispatch(commentChanged({ kind: 'edited', key, commentId: e.commentId, html: e.html, at: e.at }))
        return
      case 'deleted':
        dispatch(commentChanged({ kind: 'removed', key, commentId: e.commentId }))
        return
      case 'reacted':
        dispatch(
          commentChanged({
            kind: 'reacted',
            key,
            commentId: e.commentId,
            reactionId: e.reactionId,
            emojiId: e.emojiId,
            by: { user_profile_object_key: '', ...e.by } as UserProfileDataInterface,
            at: new Date().toISOString(),
          }),
        )
        return
      case 'unreacted':
        dispatch(commentChanged({ kind: 'unreacted', key, commentId: e.commentId, reactionId: e.reactionId }))
    }
  })

  return () => {
    offMeta()
    offComments()
    if (timer) clearTimeout(timer)
  }
}

// One live subscription per doc, held by however many parts show its threads.
const live = new Map<string, { holders: number; stop: () => void }>()

function holdLive(docId: string, dispatch: Dispatch, getState: GetState): () => void {
  const h = live.get(docId)
  if (h) h.holders += 1
  else live.set(docId, { holders: 1, stop: startLive(docId, dispatch, getState) })
  let held = true
  return () => {
    if (!held) return
    held = false
    const now = live.get(docId)
    if (!now) return
    now.holders -= 1
    if (now.holders === 0) {
      now.stop()
      live.delete(docId)
    }
  }
}

export function useThreads(resource: ThreadResource | null) {
  const dispatch = useDispatch()
  const store = useStore<Root>()
  const key = resource ? resourceKey(resource.kind, resource.uuid) : ''
  const slice = useSelector((s: Root) => s.threads)
  const entry = key ? slice?.byResource[key] : undefined
  const byId = slice?.byId

  const threads = useMemo(() => {
    if (!entry || !byId) return NONE
    return entry.ids.map((id) => byId[id]).filter((t): t is ThreadView => !!t)
  }, [entry, byId])

  const refresh = useCallback(async () => {
    if (resource) await readList(resource, dispatch, store.getState)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the resource's identity
  }, [key, dispatch, store])

  // Read when nobody has lately: the parts that mount together read once.
  useEffect(() => {
    if (!resource) return
    const s = store.getState().threads?.byResource[key]
    const recent = Date.now() - (askedAt.get(key) ?? 0) < FRESH_MS
    if (s && s.status !== 'error' && recent) return
    void readList(resource, dispatch, store.getState)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the resource's identity
  }, [key, dispatch, store])

  const docId = resource?.kind === 'doc' ? resource.uuid : ''
  useEffect(() => {
    if (!docId) return
    return holdLive(docId, dispatch, store.getState)
  }, [docId, dispatch, store])

  const run = useCallback(async <T,>(write: () => Promise<T>): Promise<T> => {
    try {
      return await write()
    } catch (e) {
      throw new Error(messageOf(e))
    }
  }, [])

  const create = useCallback(
    (anchor: Anchor, body: ThreadBody) =>
      run(async () => {
        if (!resource) throw new Error('Nothing to comment on')
        const t = await api.createThread(resource, anchor, body)
        dispatch(threadUpserted({ thread: t, at: Date.now() }))
        return t
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the resource's identity
    [key, dispatch, run],
  )

  const reply = useCallback(
    (threadId: string, body: ThreadBody) =>
      run(async () => {
        const c = await api.replyToThread(threadId, body)
        if (store.getState().threads?.byId[threadId]?.legacy) {
          // It became a thread under its own id: read it whole.
          dispatch(threadUpserted({ thread: await api.getThread(threadId), at: Date.now() }))
        } else {
          dispatch(commentAdded({ comment: c, at: Date.now() }))
        }
        return c
      }),
    [store, dispatch, run],
  )

  const settle = useCallback(
    (threadId: string, write: (id: string) => Promise<Thread>) =>
      run(async () => {
        const t = await write(threadId)
        if (store.getState().threads?.byId[threadId]?.legacy) {
          dispatch(threadUpserted({ thread: await api.getThread(threadId), at: Date.now() }))
        } else {
          dispatch(threadPatched({ thread: t, at: Date.now() }))
        }
        return t
      }),
    [store, dispatch, run],
  )

  const resolve = useCallback((id: string) => settle(id, api.resolveThread), [settle])
  const reopen = useCallback((id: string) => settle(id, api.reopenThread), [settle])
  /** "Reattach here", on the person's choice of a candidate. */
  const reanchor = useCallback((id: string, anchor: Anchor) => settle(id, (i) => api.reanchorThread(i, anchor)), [settle])

  const markRead = useCallback(
    async (threadId: string) => {
      const t = store.getState().threads?.byId[threadId]
      if (!t || !t.unread) return
      dispatch(threadRead({ id: threadId }))
      try {
        await api.markThreadRead(threadId)
      } catch {
        // Unread again next time it is read: nothing is lost.
      }
    },
    [store, dispatch],
  )

  return {
    threads,
    status: entry?.status ?? (resource ? 'loading' : 'loaded'),
    error: entry?.status === 'error' ? entry.error : undefined,
    refresh,
    create,
    reply,
    resolve,
    reopen,
    reanchor,
    markRead,
  }
}
