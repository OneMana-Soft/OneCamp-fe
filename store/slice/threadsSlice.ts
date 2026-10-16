/**
 * Anchored threads, kept by id (docs programme A8; I18: never by list index).
 *
 * A thread's comments are its resource's own comments: on a doc, the doc's
 * comments, written through the threads API (starting a thread, replying) and
 * through the comment routes by id (an edit, a delete, a reaction). Since B7
 * this store is the only place a page keeps them: the doc comment store is
 * retired. Each change to a comment is one action, commentChanged, applied by
 * the comment's id to whichever thread holds it, however many times it comes
 * (the answer to this tab's write, its echo, another tab's event).
 *
 * Writes and their echoes race: the live event for a reply can arrive before
 * the POST that made it answers, a list read can start before a thread was
 * created and land after, and an older event can land after a newer write. So:
 * - a thread's own fields are taken only from a copy at least as new as the
 *   one held (updated_at);
 * - comments are merged by id, never appended blindly;
 * - a list read is the truth for what it read, except for threads written
 *   here after it was asked for (touched), which it may not have seen;
 * - a comment change made after a read was asked for is applied to that read
 *   as it lands: the changes are numbered, and a read carries the number it
 *   was asked at (changesSeen);
 * - a deleted comment stays deleted: a copy read before the delete can't
 *   bring it back, and a thread with no comments left is not shown, as the
 *   API leaves it out;
 * - a reaction is one per person and emoji, whichever of the answer and the
 *   echo lands first (N40), and a person changing their emoji keeps its id.
 *
 * A doc's state, so not in the store's static list: it joins the store when
 * the threads UI loads (useThreads.ts injects it; store/lazySlices.ts).
 */
import { createSlice, current, isDraft, type PayloadAction } from '@reduxjs/toolkit'
import type { Thread, ThreadComment, ThreadView } from '@/components/threads/types'
import type { UserProfileDataInterface } from '@/types/user'

export interface ResourceThreads {
  ids: string[]
  status: 'loading' | 'loaded' | 'error'
  error?: string
}

/**
 * One change to one comment, by its id, for the resource whose comment it is
 * (key: resourceKey). An edit, a delete, a reaction added or changed to
 * another emoji (the same id), or a reaction taken back.
 */
export type CommentChange =
  | { kind: 'edited'; key: string; commentId: string; html: string; at?: string }
  | { kind: 'removed'; key: string; commentId: string }
  | {
      kind: 'reacted'
      key: string
      commentId: string
      reactionId: string
      emojiId: string
      by: UserProfileDataInterface
      at?: string
    }
  | { kind: 'unreacted'; key: string; commentId: string; reactionId: string }

export interface ThreadsState {
  byId: Record<string, ThreadView>
  /** By "kind:uuid". */
  byResource: Record<string, ResourceThreads>
  /** When this tab last wrote each thread (ms), so a slower read can't undo it. */
  touchedAt: Record<string, number>
  /** Comments deleted while this tab was open, by id: never shown again. */
  deleted: Record<string, true>
  /** How many comment changes have been made: the number of the latest. */
  changesSeen: number
  /** The latest changes, numbered, for reads asked for before them. */
  changes: { n: number; change: CommentChange }[]
}

const initialState: ThreadsState = { byId: {}, byResource: {}, touchedAt: {}, deleted: {}, changesSeen: 0, changes: [] }

/** Changes kept for reads still on their way: far more than land during one read. */
const MAX_CHANGES = 200

export const resourceKey = (kind: string, uuid: string) => `${kind}:${uuid}`

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0)
const byCreated = (a: ThreadComment, b: ThreadComment) => time(a.comment_created_at) - time(b.comment_created_at)

/** A plain copy of what may be an Immer draft, for the pure helpers below. */
const plain = <T,>(v: T): T => (isDraft(v) ? (current(v) as T) : v)

/**
 * One comment change applied to a list of comments, by the comment's id.
 * The same array back when it changes nothing (a change heard twice). Pure.
 */
export function applyCommentChange(comments: ThreadComment[], change: CommentChange): ThreadComment[] {
  const at = comments.findIndex((c) => c.comment_uuid === change.commentId)
  if (at < 0) return comments
  const c = comments[at]
  let next: ThreadComment
  switch (change.kind) {
    case 'removed':
      return [...comments.slice(0, at), ...comments.slice(at + 1)]
    case 'edited':
      if (c.comment_text === change.html && (!change.at || c.comment_updated_at === change.at)) return comments
      next = { ...c, comment_text: change.html, comment_updated_at: change.at || c.comment_updated_at }
      break
    case 'reacted': {
      const reactions = c.comment_reactions ?? []
      const same = reactions.findIndex((r) => r.uid === change.reactionId)
      if (same >= 0) {
        // The same reaction: heard again, or its person chose another emoji.
        if (reactions[same].reaction_emoji_id === change.emojiId) return comments
        next = { ...c, comment_reactions: reactions.map((r, i) => (i === same ? { ...r, reaction_emoji_id: change.emojiId } : r)) }
        break
      }
      // That person's reaction with this emoji, held under another id: the
      // answer and the echo of one reaction, in either order. One, with the
      // server's id.
      const mine = reactions.findIndex(
        (r) => r.reaction_emoji_id === change.emojiId && !!change.by.user_uuid && r.reaction_added_by?.user_uuid === change.by.user_uuid,
      )
      if (mine >= 0) {
        next = { ...c, comment_reactions: reactions.map((r, i) => (i === mine ? { ...r, uid: change.reactionId } : r)) }
        break
      }
      next = {
        ...c,
        comment_reactions: [
          ...reactions,
          {
            uid: change.reactionId,
            reaction_emoji_id: change.emojiId,
            reaction_added_by: change.by,
            reaction_added_at: change.at ?? '',
            reaction_on_content_added_by: c.comment_by,
          },
        ],
      }
      break
    }
    case 'unreacted': {
      const reactions = c.comment_reactions ?? []
      if (!reactions.some((r) => r.uid === change.reactionId)) return comments
      next = { ...c, comment_reactions: reactions.filter((r) => r.uid !== change.reactionId) }
      break
    }
  }
  const out = comments.slice()
  out[at] = next
  return out
}

/** Comments of both, each once and none deleted; for one id the later-edited copy. */
function unionComments(held: ThreadComment[], incoming: ThreadComment[], deleted: ThreadsState['deleted']): ThreadComment[] {
  const out = new Map<string, ThreadComment>()
  for (const c of [...held, ...incoming]) {
    if (deleted[c.comment_uuid]) continue
    const prev = out.get(c.comment_uuid)
    if (!prev || time(c.comment_updated_at || c.comment_created_at) >= time(prev.comment_updated_at || prev.comment_created_at)) {
      out.set(c.comment_uuid, c)
    }
  }
  return [...out.values()].sort(byCreated)
}

/** A thread's fields from whichever copy is newer; comments as asked. */
function mergeThread(state: ThreadsState, incoming: ThreadView, comments: 'union' | 'replace'): ThreadView {
  const held = state.byId[incoming.id] ? plain(state.byId[incoming.id]) : undefined
  const fresh = incoming.comments.filter((c) => !state.deleted[c.comment_uuid]).sort(byCreated)
  if (!held) return { ...incoming, comments: fresh }
  const newer = time(incoming.updated_at) >= time(held.updated_at) ? incoming : held
  return {
    ...newer,
    comments: comments === 'union' ? unionComments(held.comments, fresh, state.deleted) : fresh,
  }
}

/** Holds t, or lets it go when no comment of it is left. Reports whether it is held. */
function keep(state: ThreadsState, t: ThreadView): boolean {
  if (t.comments.length === 0) {
    delete state.byId[t.id]
    return false
  }
  state.byId[t.id] = t
  return true
}

function place(state: ThreadsState, t: ThreadView) {
  const key = resourceKey(t.resource_kind, t.resource_uuid)
  const r = (state.byResource[key] ??= { ids: [], status: 'loaded' })
  if (!r.ids.includes(t.id)) r.ids.push(t.id)
}

/** A thread as a read found it, with the comment changes made since the read was asked for. */
function withChanges(t: ThreadView, later: ThreadsState['changes']): ThreadView {
  let comments = t.comments
  for (const { change } of later) comments = applyCommentChange(comments, change)
  return comments === t.comments ? t : { ...t, comments }
}

export const threadsSlice = createSlice({
  name: 'threads',
  initialState,
  reducers: {
    threadsRequested(state, a: PayloadAction<{ key: string }>) {
      const r = (state.byResource[a.payload.key] ??= { ids: [], status: 'loading' })
      if (r.status === 'error') r.status = 'loading'
    },
    /**
     * A list read. requestedAt is when it was asked for (ms); changesSeen is
     * the slice's changesSeen then, so the comment changes made since are
     * applied to what it read (left out, none are).
     */
    threadsLoaded(state, a: PayloadAction<{ key: string; threads: ThreadView[]; requestedAt: number; changesSeen?: number }>) {
      const { key, threads, requestedAt, changesSeen = state.changesSeen } = a.payload
      const later = plain(state.changes).filter((c) => c.n > changesSeen && c.change.key === key)
      const ids: string[] = []
      for (const read of threads) {
        const t = later.length ? withChanges(read, later) : read
        const touched = (state.touchedAt[t.id] ?? 0) > requestedAt
        if (keep(state, mergeThread(state, t, touched ? 'union' : 'replace'))) ids.push(t.id)
      }
      // Threads written here after the read was asked for stay, after the rest.
      const kept = (state.byResource[key]?.ids ?? []).filter(
        (id) => !ids.includes(id) && (state.touchedAt[id] ?? 0) > requestedAt && !!state.byId[id],
      )
      state.byResource[key] = { ids: [...ids, ...kept], status: 'loaded' }
    },
    threadsFailed(state, a: PayloadAction<{ key: string; error: string }>) {
      const r = (state.byResource[a.payload.key] ??= { ids: [], status: 'error' })
      r.status = 'error'
      r.error = a.payload.error
    },
    /** A whole thread: an answer to this tab's write, or one read on its own. */
    threadUpserted(state, a: PayloadAction<{ thread: ThreadView; at: number }>) {
      const t = a.payload.thread
      state.touchedAt[t.id] = Math.max(state.touchedAt[t.id] ?? 0, a.payload.at)
      if (keep(state, mergeThread(state, t, 'union'))) place(state, t)
    },
    /** A thread read on its own that is no more (every comment in it deleted), or no longer readable. */
    threadGone(state, a: PayloadAction<{ id: string }>) {
      const id = a.payload.id
      const t = state.byId[id]
      if (!t) return
      delete state.byId[id]
      const r = state.byResource[resourceKey(t.resource_kind, t.resource_uuid)]
      if (r) r.ids = r.ids.filter((x) => x !== id)
    },
    /** A thread's own fields (resolve, reopen, reattach), kept only if not older. */
    threadPatched(state, a: PayloadAction<{ thread: Thread; at: number }>) {
      const t = a.payload.thread
      const held = state.byId[t.id]
      if (!held) return
      if (time(t.updated_at) >= time(held.updated_at)) state.byId[t.id] = { ...held, ...t }
      state.touchedAt[t.id] = Math.max(state.touchedAt[t.id] ?? 0, a.payload.at)
    },
    /** A comment in a thread, however many times it arrives. */
    commentAdded(state, a: PayloadAction<{ comment: ThreadComment; at: number }>) {
      const c = a.payload.comment
      const held = state.byId[c.thread_id]
      if (!held) return
      held.comments = unionComments(plain(held.comments), [c], state.deleted)
      state.touchedAt[c.thread_id] = Math.max(state.touchedAt[c.thread_id] ?? 0, a.payload.at)
    },
    /** One change to a comment, by its id, in whichever thread holds it. */
    commentChanged(state, a: PayloadAction<CommentChange>) {
      const change = a.payload
      if (change.kind === 'removed') state.deleted[change.commentId] = true
      // Numbered and kept a while, for a read asked for before it.
      state.changesSeen += 1
      state.changes.push({ n: state.changesSeen, change })
      if (state.changes.length > MAX_CHANGES) state.changes.splice(0, state.changes.length - MAX_CHANGES)
      const r = state.byResource[change.key]
      if (!r) return
      r.ids = r.ids.filter((id) => {
        const t = state.byId[id]
        if (!t) return false
        if (!t.comments.some((c) => c.comment_uuid === change.commentId)) return true
        t.comments = applyCommentChange(plain(t.comments), change)
        return keep(state, t)
      })
    },
    /** This person has read it. */
    threadRead(state, a: PayloadAction<{ id: string }>) {
      const held = state.byId[a.payload.id]
      if (held) held.unread = false
    },
  },
})

export const {
  threadsRequested,
  threadsLoaded,
  threadsFailed,
  threadUpserted,
  threadGone,
  threadPatched,
  commentAdded,
  commentChanged,
  threadRead,
} = threadsSlice.actions

export default threadsSlice

declare module '@/store/lazySlices' {
  interface LazySlices {
    threads: ThreadsState
  }
}
