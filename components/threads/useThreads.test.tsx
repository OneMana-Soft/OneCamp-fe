import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import type { ReactNode } from 'react'
import threadsSlice from '@/store/slice/threadsSlice'
import { emitDocCommentEvent } from '@/lib/docComments/events'
import { emitDocMeta } from '@/lib/docMeta/bus'
import type { ThreadView } from './types'

vi.mock('./threadsApi', () => ({
  listThreads: vi.fn(),
  getThread: vi.fn(),
  createThread: vi.fn(),
  replyToThread: vi.fn(),
  resolveThread: vi.fn(),
  reopenThread: vi.fn(),
  reanchorThread: vi.fn(),
  markThreadRead: vi.fn(),
}))
import * as api from './threadsApi'
import { useThreads } from './useThreads'

const view = (id: string, over: Partial<ThreadView> = {}): ThreadView => ({
  id,
  resource_kind: 'doc',
  resource_uuid: 'd1',
  anchor: { kind: 'none' },
  status: 'open',
  created_by: 'u',
  created_at: '2026-10-12T09:00:00Z',
  updated_at: '2026-10-12T09:00:00Z',
  comments: [{ comment_uuid: `${id}-c`, thread_id: id, comment_text: 'hi', comment_by: { user_uuid: 'u' } as never, comment_created_at: '2026-10-12T09:00:00Z' }],
  participants: [],
  unread: true,
  can_reply: true,
  can_resolve: true,
  ...over,
})

function setup() {
  const store = configureStore({ reducer: { threads: threadsSlice.reducer } })
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return { store, wrapper }
}

const res = { kind: 'doc', uuid: 'd1' }

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

describe('useThreads', () => {
  it('lists, and says an error is an error rather than showing nothing', async () => {
    vi.mocked(api.listThreads).mockRejectedValueOnce({ response: { data: { msg: 'That thread or page no longer exists.' } } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useThreads(res), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('That thread or page no longer exists.')

    vi.mocked(api.listThreads).mockResolvedValueOnce([view('t1')])
    await act(() => result.current.refresh())
    expect(result.current.status).toBe('loaded')
    expect(result.current.threads.map((t) => t.id)).toEqual(['t1'])
  })

  it('puts each write’s answer in place by id, and a reply to a flat comment reads it whole', async () => {
    vi.mocked(api.listThreads).mockResolvedValue([view('legacy-1', { legacy: true, unread: false })])
    const { wrapper } = setup()
    const { result } = renderHook(() => useThreads(res), { wrapper })
    await waitFor(() => expect(result.current.threads).toHaveLength(1))

    vi.mocked(api.createThread).mockResolvedValueOnce(view('t2'))
    await act(async () => {
      await result.current.create({ kind: 'yrange', start: 'AQ==', end: 'Ag==', quote: 'x' }, { body: '<p>hi</p>' })
    })
    expect(result.current.threads.map((t) => t.id)).toEqual(['legacy-1', 't2'])

    vi.mocked(api.replyToThread).mockResolvedValueOnce({ comment_uuid: 'r1', thread_id: 'legacy-1', comment_text: 'ok', comment_by: { user_uuid: 'u' } as never, comment_created_at: '2026-10-12T09:30:00Z' })
    vi.mocked(api.getThread).mockResolvedValueOnce(view('legacy-1', { legacy: false, updated_at: '2026-10-12T09:30:00Z' }))
    await act(async () => {
      await result.current.reply('legacy-1', { body: '<p>ok</p>' })
    })
    expect(api.getThread).toHaveBeenCalledWith('legacy-1')
    expect(result.current.threads[0].legacy).toBe(false)

    vi.mocked(api.resolveThread).mockResolvedValueOnce({ ...view('t2'), status: 'resolved', updated_at: '2026-10-12T09:40:00Z' })
    await act(async () => {
      await result.current.resolve('t2')
    })
    expect(result.current.threads[1].status).toBe('resolved')

    await act(() => result.current.markRead('t2'))
    expect(api.markThreadRead).toHaveBeenCalledWith('t2')
    expect(result.current.threads[1].unread).toBe(false)
  })

  it('throws a write’s refusal with the server’s words', async () => {
    vi.mocked(api.listThreads).mockResolvedValue([view('t1')])
    vi.mocked(api.resolveThread).mockRejectedValueOnce({ response: { data: { msg: 'Only the person who started this thread, or someone who can edit, can do that.' } } })
    const { wrapper } = setup()
    const { result } = renderHook(() => useThreads(res), { wrapper })
    await waitFor(() => expect(result.current.threads).toHaveLength(1))
    await expect(result.current.resolve('t1')).rejects.toThrow('Only the person who started this thread')
    expect(result.current.threads[0].status).toBe('open')
  })
})

describe('useThreads, one read and one subscription per doc', () => {
  it('reads once for the parts of a page that mount together, and asks for a thread once per event', async () => {
    const doc = { kind: 'doc', uuid: 'd-shared' }
    vi.mocked(api.listThreads).mockResolvedValue([view('s1', { resource_uuid: 'd-shared' })])
    vi.mocked(api.getThread).mockResolvedValue(view('s2', { resource_uuid: 'd-shared' }))
    const { wrapper } = setup()
    const margin = renderHook(() => useThreads(doc), { wrapper })
    renderHook(() => useThreads(doc), { wrapper })
    renderHook(() => useThreads(doc), { wrapper })
    await waitFor(() => expect(margin.result.current.threads).toHaveLength(1))
    expect(api.listThreads).toHaveBeenCalledTimes(1)

    act(() => emitDocMeta({ kind: 'thread.created', doc_uuid: 'd-shared', at: '', data: { thread_id: 's2', comment_id: 's2-c' } }))
    await waitFor(() => expect(margin.result.current.threads.map((t) => t.id)).toEqual(['s1', 's2']))
    expect(api.getThread).toHaveBeenCalledTimes(1)
  })
})

describe('useThreads, live through the doc’s comment events', () => {
  it('changes a comment by its id, however often the event comes, and leaves others alone', async () => {
    const doc = { kind: 'doc', uuid: 'd-events' }
    vi.mocked(api.listThreads).mockResolvedValue([view('e1', { resource_uuid: 'd-events' }), view('e2', { resource_uuid: 'd-events' })])
    const { wrapper } = setup()
    const { result } = renderHook(() => useThreads(doc), { wrapper })
    await waitFor(() => expect(result.current.threads).toHaveLength(2))

    const sam = { user_uuid: 'u-sam', user_name: 'Sam Rivera' }
    act(() => {
      for (let i = 0; i < 2; i++) {
        emitDocCommentEvent({ kind: 'edited', docId: 'd-events', commentId: 'e1-c', html: '<p>edited</p>', at: '2026-10-12T09:05:00Z' })
        emitDocCommentEvent({ kind: 'reacted', docId: 'd-events', commentId: 'e1-c', reactionId: 'r1', emojiId: 'tada', by: sam })
      }
    })
    const e1 = () => result.current.threads.find((t) => t.id === 'e1')!
    expect(e1().comments[0].comment_text).toBe('<p>edited</p>')
    expect(e1().comments[0].comment_reactions?.map((r) => r.uid)).toEqual(['r1'])
    expect(result.current.threads.find((t) => t.id === 'e2')!.comments[0].comment_text).toBe('hi')

    // Sam picks another emoji: the same reaction, the server says, with the same id.
    act(() => emitDocCommentEvent({ kind: 'reacted', docId: 'd-events', commentId: 'e1-c', reactionId: 'r1', emojiId: 'heart', by: sam }))
    expect(e1().comments[0].comment_reactions?.map((r) => r.reaction_emoji_id)).toEqual(['heart'])
    act(() => emitDocCommentEvent({ kind: 'unreacted', docId: 'd-events', commentId: 'e1-c', reactionId: 'r1' }))
    expect(e1().comments[0].comment_reactions).toEqual([])

    // Its only comment deleted, the thread goes, as the API leaves it out.
    act(() => emitDocCommentEvent({ kind: 'deleted', docId: 'd-events', commentId: 'e2-c' }))
    expect(result.current.threads.map((t) => t.id)).toEqual(['e1'])
    // Another doc's event changes nothing here.
    act(() => emitDocCommentEvent({ kind: 'edited', docId: 'elsewhere', commentId: 'e1-c', html: '<p>no</p>' }))
    expect(e1().comments[0].comment_text).toBe('<p>edited</p>')
  })

  it('reads the list again for a comment written the old way, once, when no thread holds it a moment later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const doc = { kind: 'doc', uuid: 'd-old' }
    vi.mocked(api.listThreads).mockResolvedValue([view('o1', { resource_uuid: 'd-old' })])
    const { wrapper } = setup()
    const { result } = renderHook(() => useThreads(doc), { wrapper })
    await waitFor(() => expect(result.current.threads).toHaveLength(1))
    expect(api.listThreads).toHaveBeenCalledTimes(1)

    // The thread's own comment: nothing new.
    act(() => emitDocCommentEvent({ kind: 'created', docId: 'd-old', commentId: 'o1-c' }))
    // Two page comments from an older app, together: one read.
    act(() => {
      emitDocCommentEvent({ kind: 'created', docId: 'd-old', commentId: 'flat-1' })
      emitDocCommentEvent({ kind: 'created', docId: 'd-old', commentId: 'flat-2' })
    })
    await act(async () => {
      vi.advanceTimersByTime(1600)
    })
    await waitFor(() => expect(api.listThreads).toHaveBeenCalledTimes(2))
  })
})

describe('useThreads, a read on its way', () => {
  it('shows an edit made while the list was being read, not the copy the read found', async () => {
    const doc = { kind: 'doc', uuid: 'd-way' }
    const { wrapper } = setup()
    let answer: (v: ThreadView[]) => void = () => undefined
    vi.mocked(api.listThreads).mockImplementationOnce(() => new Promise((ok) => (answer = ok)))
    const { result } = renderHook(() => useThreads(doc), { wrapper })
    await waitFor(() => expect(api.listThreads).toHaveBeenCalledTimes(1))
    act(() => emitDocCommentEvent({ kind: 'edited', docId: 'd-way', commentId: 'w1-c', html: '<p>edited</p>', at: '2026-10-12T09:05:00Z' }))
    await act(async () => answer([view('w1', { resource_uuid: 'd-way' })]))
    expect(result.current.threads[0].comments[0].comment_text).toBe('<p>edited</p>')
  })
})

describe('useThreads, live through A6 thread events', () => {
  it('reads a thread by its id when an event names it, unless what the event says is held', async () => {
    const doc = { kind: 'doc', uuid: 'd-live' }
    vi.mocked(api.listThreads).mockResolvedValue([view('t1', { resource_uuid: 'd-live' })])
    const { wrapper } = setup()
    const { result } = renderHook(() => useThreads(doc), { wrapper })
    await waitFor(() => expect(result.current.threads).toHaveLength(1))

    // Held already (this tab's own reply, or an event heard twice): nothing to read.
    act(() => emitDocMeta({ kind: 'thread.replied', doc_uuid: 'd-live', at: '', data: { thread_id: 't1', comment_id: 't1-c' } }))
    act(() => emitDocMeta({ kind: 'thread.reopened', doc_uuid: 'd-live', at: '', data: { thread_id: 't1', status: 'open' } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getThread).not.toHaveBeenCalled()

    // Someone else's reply: that thread is read again, by its id, not the list.
    const replied = view('t1', { resource_uuid: 'd-live', updated_at: '2026-10-12T09:10:00Z' })
    replied.comments = [...replied.comments, { ...replied.comments[0], comment_uuid: 'r9', comment_created_at: '2026-10-12T09:10:00Z' }]
    vi.mocked(api.getThread).mockResolvedValueOnce(replied)
    act(() => emitDocMeta({ kind: 'thread.replied', doc_uuid: 'd-live', at: '', data: { thread_id: 't1', comment_id: 'r9' } }))
    await waitFor(() => expect(result.current.threads[0].comments.map((c) => c.comment_uuid)).toEqual(['t1-c', 'r9']))
    expect(api.getThread).toHaveBeenCalledWith('t1')
    expect(api.listThreads).toHaveBeenCalledTimes(1)

    // Resolved elsewhere: read again.
    vi.mocked(api.getThread).mockResolvedValueOnce({ ...replied, status: 'resolved', updated_at: '2026-10-12T09:20:00Z' })
    act(() => emitDocMeta({ kind: 'thread.resolved', doc_uuid: 'd-live', at: '', data: { thread_id: 't1', status: 'resolved' } }))
    await waitFor(() => expect(result.current.threads[0].status).toBe('resolved'))

    // A thread nobody can read any more (every comment gone): let go.
    vi.mocked(api.getThread).mockRejectedValueOnce({ response: { status: 404, data: { msg: 'gone' } } })
    act(() => emitDocMeta({ kind: 'thread.reanchored', doc_uuid: 'd-live', at: '', data: { thread_id: 't1' } }))
    await waitFor(() => expect(result.current.threads).toHaveLength(0))

    // Other kinds, and other docs, read nothing; an event naming no thread reads the list.
    const reads = vi.mocked(api.getThread).mock.calls.length
    act(() => emitDocMeta({ kind: 'doc.renamed', doc_uuid: 'd-live', at: '', data: { title: 'x' } }))
    act(() => emitDocMeta({ kind: 'thread.reanchored', doc_uuid: 'other', at: '', data: { thread_id: 't1' } }))
    await new Promise((r) => setTimeout(r, 20))
    expect(api.getThread).toHaveBeenCalledTimes(reads)
    act(() => emitDocMeta({ kind: 'thread.resolved', doc_uuid: 'd-live', at: '' }))
    await waitFor(() => expect(api.listThreads).toHaveBeenCalledTimes(2))
  })
})
