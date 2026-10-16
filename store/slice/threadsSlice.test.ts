import { describe, expect, it } from 'vitest'
import type { ThreadComment, ThreadView } from '@/components/threads/types'
import threadsSlice, {
  applyCommentChange,
  commentAdded,
  commentChanged,
  resourceKey,
  threadGone,
  threadPatched,
  threadsLoaded,
  threadUpserted,
  type ThreadsState,
} from './threadsSlice'

const reduce = (state: ThreadsState | undefined, ...actions: Parameters<typeof threadsSlice.reducer>[1][]) =>
  actions.reduce((s, a) => threadsSlice.reducer(s, a), state ?? threadsSlice.reducer(undefined, { type: '@@init' }))

const comment = (id: string, thread: string, at: string, text = id): ThreadComment => ({
  comment_uuid: id,
  thread_id: thread,
  comment_text: text,
  comment_by: { user_uuid: 'u' } as ThreadComment['comment_by'],
  comment_created_at: at,
})

const thread = (id: string, updated: string, over: Partial<ThreadView> = {}): ThreadView => ({
  id,
  resource_kind: 'doc',
  resource_uuid: 'd1',
  anchor: { kind: 'none' },
  status: 'open',
  created_by: 'u',
  created_at: '2026-10-12T09:00:00Z',
  updated_at: updated,
  comments: [comment(`${id}-c1`, id, '2026-10-12T09:00:00Z')],
  participants: [],
  unread: false,
  can_reply: true,
  can_resolve: true,
  ...over,
})

const key = resourceKey('doc', 'd1')

describe('threads kept by id', () => {
  it('takes a reply once when its echo arrives before the answer to the write', () => {
    const t = thread('t1', '2026-10-12T09:00:00Z')
    const reply = comment('c2', 't1', '2026-10-12T09:05:00Z')
    const s = reduce(
      undefined,
      threadUpserted({ thread: t, at: 1 }),
      commentAdded({ comment: reply, at: 2 }), // the live event, first
      commentAdded({ comment: reply, at: 3 }), // the POST's answer
    )
    expect(s.byId.t1.comments.map((c) => c.comment_uuid)).toEqual(['t1-c1', 'c2'])
  })

  it('never lets an older copy undo a newer resolve', () => {
    const t = thread('t1', '2026-10-12T09:00:00Z')
    const resolved = { ...t, status: 'resolved' as const, resolved_by: 'u', updated_at: '2026-10-12T09:10:00Z' }
    const s = reduce(
      undefined,
      threadUpserted({ thread: t, at: 1 }),
      threadPatched({ thread: resolved, at: 2 }),
      // An event from before the resolve, landing after it.
      threadUpserted({ thread: { ...t, comments: [...t.comments, comment('c2', 't1', '2026-10-12T09:05:00Z')] }, at: 3 }),
    )
    expect(s.byId.t1.status).toBe('resolved')
    expect(s.byId.t1.comments).toHaveLength(2) // its comment still counts
  })

  it('keeps a thread made here after a list read was asked for that the read did not see', () => {
    const old = thread('t0', '2026-10-12T09:00:00Z')
    const made = thread('t9', '2026-10-12T09:20:00Z', { created_at: '2026-10-12T09:20:00Z' })
    const s = reduce(
      undefined,
      threadUpserted({ thread: made, at: 2000 }), // the create answered first
      threadsLoaded({ key, threads: [old], requestedAt: 1000 }), // a read asked before it
    )
    expect(s.byResource[key].ids).toEqual(['t0', 't9'])
    expect(s.byId.t9.comments).toHaveLength(1)
  })

  it('takes a list read as the truth for what it read', () => {
    const t = thread('t1', '2026-10-12T09:00:00Z', {
      comments: [comment('a', 't1', '2026-10-12T09:00:00Z'), comment('b', 't1', '2026-10-12T09:01:00Z')],
    })
    const after = { ...t, comments: [comment('a', 't1', '2026-10-12T09:00:00Z')] } // b was deleted
    const s = reduce(undefined, threadsLoaded({ key, threads: [t], requestedAt: 10 }), threadsLoaded({ key, threads: [after], requestedAt: 20 }))
    expect(s.byId.t1.comments.map((c) => c.comment_uuid)).toEqual(['a'])
    const gone = reduce(s, threadsLoaded({ key, threads: [], requestedAt: 30 }))
    expect(gone.byResource[key].ids).toEqual([])
  })

  it('orders comments by when they were written, whatever order they arrive in', () => {
    const t = thread('t1', '2026-10-12T09:00:00Z')
    const s = reduce(
      undefined,
      threadUpserted({ thread: t, at: 1 }),
      commentAdded({ comment: comment('late', 't1', '2026-10-12T09:09:00Z'), at: 2 }),
      commentAdded({ comment: comment('early', 't1', '2026-10-12T09:03:00Z'), at: 3 }),
    )
    expect(s.byId.t1.comments.map((c) => c.comment_uuid)).toEqual(['t1-c1', 'early', 'late'])
  })
})

// A thread's comments are the doc's comments: changed by the comment's id
// (commentChanged), whichever of a write's answer and its echo comes first,
// and however many times (B7: the doc comment store is retired).
const edit = (commentId: string, html: string, at = '2026-10-12T09:02:00Z', docId = 'd1') =>
  commentChanged({ kind: 'edited', key: resourceKey('doc', docId), commentId, html, at })
const remove = (commentId: string) => commentChanged({ kind: 'removed', key, commentId })
const reacted = (commentId: string, reactionId: string, emojiId: string, by = 'u2') =>
  commentChanged({ kind: 'reacted', key, commentId, reactionId, emojiId, by: { user_uuid: by, user_name: by, user_profile_object_key: '' } })

describe('a comment changed by its id', () => {
  const two = () =>
    thread('t1', '2026-10-12T09:00:00Z', {
      comments: [comment('a', 't1', '2026-10-12T09:00:00Z'), comment('b', 't1', '2026-10-12T09:01:00Z')],
    })

  it('takes an edit and a reaction once, however often each arrives', () => {
    const other = thread('t2', '2026-10-12T09:00:00Z')
    const s = reduce(
      undefined,
      threadsLoaded({ key, threads: [two(), other], requestedAt: 1 }),
      edit('b', '<p>edited</p>'),
      reacted('a', 'r1', 'thumbsup'),
      edit('b', '<p>edited</p>'),
      reacted('a', 'r1', 'thumbsup'),
    )
    expect(s.byId.t1.comments.map((c) => c.comment_text)).toEqual(['a', '<p>edited</p>'])
    expect(s.byId.t1.comments[1].comment_updated_at).toBe('2026-10-12T09:02:00Z')
    expect(s.byId.t1.comments[0].comment_reactions?.map((r) => r.uid)).toEqual(['r1'])
    expect(s.byId.t1.comments.every((c) => c.thread_id === 't1')).toBe(true)
    expect(s.byId.t2).toEqual(other) // a thread without the comment is left alone

    const unreacted = reduce(s, commentChanged({ kind: 'unreacted', key, commentId: 'a', reactionId: 'r1' }))
    expect(unreacted.byId.t1.comments[0].comment_reactions).toEqual([])
  })

  it('keeps a deleted comment deleted, whatever older copy lands after', () => {
    const t = two()
    const s = reduce(undefined, threadsLoaded({ key, threads: [t], requestedAt: 1 }), remove('b'))
    expect(s.byId.t1.comments.map((c) => c.comment_uuid)).toEqual(['a'])
    // A list read asked for before the delete, an answer to an earlier write,
    // and the comment's own late echo: none brings it back.
    const late = reduce(
      s,
      threadsLoaded({ key, threads: [t], requestedAt: 0 }),
      threadUpserted({ thread: t, at: 5 }),
      commentAdded({ comment: t.comments[1], at: 6 }),
    )
    expect(late.byId.t1.comments.map((c) => c.comment_uuid)).toEqual(['a'])
  })

  it('lets a thread go when its last comment is deleted, as the API does', () => {
    const t = thread('t1', '2026-10-12T09:00:00Z')
    const s = reduce(undefined, threadsLoaded({ key, threads: [t], requestedAt: 1 }), remove('t1-c1'))
    expect(s.byResource[key].ids).toEqual([])
    expect(s.byId.t1).toBeUndefined()
    const late = reduce(s, threadsLoaded({ key, threads: [t], requestedAt: 0 }))
    expect(late.byResource[key].ids).toEqual([])
  })

  it('leaves another doc’s threads alone', () => {
    const s = reduce(undefined, threadsLoaded({ key, threads: [two()], requestedAt: 1 }), edit('a', '<p>elsewhere</p>', '2026-10-12T09:03:00Z', 'd2'))
    expect(s.byId.t1.comments[0].comment_text).toBe('a')
  })

  it('lets go of a thread read on its own that is no more', () => {
    const s = reduce(undefined, threadsLoaded({ key, threads: [two(), thread('t2', '2026-10-12T09:00:00Z')], requestedAt: 1 }), threadGone({ id: 't1' }))
    expect(s.byResource[key].ids).toEqual(['t2'])
    expect(s.byId.t1).toBeUndefined()
  })
})

// N40: a reaction showed twice when its echo landed before the answer.
describe('a reaction', () => {
  const one = () => [comment('a', 't1', '2026-10-12T09:00:00Z')]
  const by = { user_uuid: 'u-sam', user_name: 'Sam Rivera', user_profile_object_key: '' }
  const change = (reactionId: string, emojiId: string) =>
    ({ kind: 'reacted', key, commentId: 'a', reactionId, emojiId, by }) as const

  it('is one, whichever of the answer and the echo lands first, with the server’s id', () => {
    const once = applyCommentChange(one(), change('r1', 'tada'))
    expect(applyCommentChange(once, change('r1', 'tada'))).toBe(once)
    // Held under another id (a write's answer before the event): adopts the event's.
    const adopted = applyCommentChange(once, change('r2', 'tada'))
    expect(adopted[0].comment_reactions?.map((r) => r.uid)).toEqual(['r2'])
  })

  it('changes its emoji when its person picks another, keeping its id', () => {
    const changed = applyCommentChange(applyCommentChange(one(), change('r1', 'tada')), change('r1', 'heart'))
    expect(changed[0].comment_reactions?.map((r) => [r.uid, r.reaction_emoji_id])).toEqual([['r1', 'heart']])
  })

  it('is another person’s own, beside the first', () => {
    const two = applyCommentChange(applyCommentChange(one(), change('r1', 'tada')), { ...change('r3', 'tada'), by: { user_uuid: 'u-maya', user_name: 'Maya', user_profile_object_key: '' } })
    expect(two[0].comment_reactions?.map((r) => r.uid)).toEqual(['r1', 'r3'])
  })

  it('changes nothing for a comment it isn’t on', () => {
    const list = one()
    expect(applyCommentChange(list, { ...change('r1', 'tada'), commentId: 'zzz' })).toBe(list)
  })
})

// A threads read asked for before a change gets the change as it lands.
describe('a read on its way when a comment changes', () => {
  it('applies an edit and a reaction made after it was asked for, even before any thread was held', () => {
    const asked = reduce(undefined)
    const seen = asked.changesSeen
    const s = reduce(
      asked,
      edit('t1-c1', '<p>edited</p>', '2026-10-12T09:05:00Z'),
      reacted('t1-c1', 'r1', 'tada'),
      threadsLoaded({ key, threads: [thread('t1', '2026-10-12T09:00:00Z')], requestedAt: 1, changesSeen: seen }),
    )
    expect(s.byId.t1.comments[0].comment_text).toBe('<p>edited</p>')
    expect(s.byId.t1.comments[0].comment_reactions?.map((r) => r.uid)).toEqual(['r1'])
  })

  it('takes a read asked for after the change as it is', () => {
    const changed = reduce(undefined, edit('t1-c1', '<p>edited</p>', '2026-10-12T09:05:00Z'))
    const read = thread('t1', '2026-10-12T09:00:00Z', {
      comments: [comment('t1-c1', 't1', '2026-10-12T09:00:00Z', '<p>edited again, elsewhere</p>')],
    })
    const s = reduce(changed, threadsLoaded({ key, threads: [read], requestedAt: 2, changesSeen: changed.changesSeen }))
    expect(s.byId.t1.comments[0].comment_text).toBe('<p>edited again, elsewhere</p>')
  })

  it('keeps only the latest changes', () => {
    let s = reduce(undefined)
    for (let i = 0; i < 250; i++) s = reduce(s, edit('t1-c1', `<p>${i}</p>`, '2026-10-12T09:05:00Z'))
    expect(s.changesSeen).toBe(250)
    expect(s.changes).toHaveLength(200)
    expect(s.changes[0].n).toBe(51)
  })
})
