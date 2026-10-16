/**
 * The threads API (router/docsThreads.go). Its base path, THREADS_PATH, is
 * in services/endPoints.ts with the other packages' paths. Errors carry the
 * server's message, written for the person.
 */
import axiosInstance from '@/lib/axiosInstance'
import type { Anchor } from '@/lib/anchors/types'
import { THREADS_PATH } from '@/services/endPoints'
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
