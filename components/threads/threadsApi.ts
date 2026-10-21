/**
 * The threads API (router/docsThreads.go). Its base path, THREADS_PATH, is
 * in services/endPoints.ts with the other packages' paths. Errors carry the
 * server's message, written for the person.
 */
import axiosInstance from '@/lib/axiosInstance'
import type { Anchor } from '@/lib/anchors/types'
import { THREADS_PATH } from "@/services/endpoints/chat"
import type { Thread, ThreadBody, ThreadComment, ThreadResource, ThreadStatus, ThreadView } from './types'

const one = (id: string) => `${THREADS_PATH}/${encodeURIComponent(id)}`

type Envelope<T> = { data: T }

export async function listThreads(res: ThreadResource, status?: ThreadStatus): Promise<ThreadView[]> {
  const q = new URLSearchParams({ resource_kind: res.kind, resource_uuid: res.uuid })
  if (status) q.set('status', status)
  const r = await axiosInstance.get<Envelope<{ threads: ThreadView[] }>>(`${THREADS_PATH}?${q}`)
  return r.data.data.threads ?? []
}

export async function getThread(id: string): Promise<ThreadView> {
  return (await axiosInstance.get<Envelope<ThreadView>>(one(id))).data.data
}

export async function createThread(res: ThreadResource, anchor: Anchor, body: ThreadBody): Promise<ThreadView> {
  const r = await axiosInstance.post<Envelope<ThreadView>>(THREADS_PATH, {
    resource_kind: res.kind,
    resource_uuid: res.uuid,
    anchor,
    ...body,
  })
  return r.data.data
}

export async function replyToThread(id: string, body: ThreadBody): Promise<ThreadComment> {
  return (await axiosInstance.post<Envelope<ThreadComment>>(`${one(id)}/replies`, body)).data.data
}

export async function resolveThread(id: string): Promise<Thread> {
  return (await axiosInstance.post<Envelope<Thread>>(`${one(id)}/resolve`, {})).data.data
}

export async function reopenThread(id: string): Promise<Thread> {
  return (await axiosInstance.post<Envelope<Thread>>(`${one(id)}/reopen`, {})).data.data
}

/** "Reattach here": only ever on someone's choice. */
export async function reanchorThread(id: string, anchor: Anchor): Promise<Thread> {
  return (await axiosInstance.post<Envelope<Thread>>(`${one(id)}/reanchor`, { anchor })).data.data
}

export async function markThreadRead(id: string): Promise<void> {
  await axiosInstance.post(`${one(id)}/read`, {})
}

/**
 * A comment threads keep (a table row's: business/Thread commentChanges.go),
 * by its thread and its id. A doc's comments change through the doc's own
 * routes (components/docComments/docCommentApi); these answer "not available"
 * for them.
 */
const commentPath = (threadId: string, commentId: string) => `${one(threadId)}/comments/${encodeURIComponent(commentId)}`

/** Its writer's new words; answers the comment as stored. */
export async function editThreadComment(threadId: string, commentId: string, body: string): Promise<ThreadComment> {
  return (await axiosInstance.post<Envelope<ThreadComment>>(`${commentPath(threadId, commentId)}/edit`, { body })).data.data
}

/** Its writer, or a moderator (the owner, full access, an admin), removes it. */
export async function removeThreadComment(threadId: string, commentId: string): Promise<void> {
  await axiosInstance.post(`${commentPath(threadId, commentId)}/remove`, {})
}

/** Adds the person's reaction, or changes its emoji; answers the reaction's id. */
export async function reactToThreadComment(threadId: string, commentId: string, emojiId: string): Promise<string> {
  const r = await axiosInstance.post<Envelope<{ reaction_id: string }>>(`${commentPath(threadId, commentId)}/react`, { emoji_id: emojiId })
  return r.data.data.reaction_id
}

/** Takes back the person's own reaction. */
export async function unreactToThreadComment(threadId: string, commentId: string, reactionId: string): Promise<void> {
  await axiosInstance.post(`${commentPath(threadId, commentId)}/unreact`, { reaction_id: reactionId })
}
