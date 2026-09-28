import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"
import type { LaterItemType } from "@/lib/utils/later"

/** One thing saved for later. Mirrors the backend saved_items row. */
export interface LaterItem {
  id: string
  item_type: LaterItemType
  item_id: string
  link: string
  title: string
  context: string
  remind_at?: string
  reminded_at?: string
  done_at?: string
  created_at: string
  updated_at: string
}

export interface LaterList {
  items: LaterItem[]
  open: number
  due: number
}

export interface SaveLaterInput {
  item_type: LaterItemType
  item_id: string
  link: string
  title: string
  context?: string
  remind_at?: string | null
}

export async function saveLater(input: SaveLaterInput): Promise<LaterItem> {
  const res = await axiosInstance.post(PostEndpointUrl.LaterSave, input)
  return res.data?.data as LaterItem
}

export async function setLaterReminder(id: string, remindAt: Date | null): Promise<LaterItem> {
  const body = remindAt ? { id, remind_at: remindAt.toISOString() } : { id, clear_remind: true }
  const res = await axiosInstance.post(PostEndpointUrl.LaterUpdate, body)
  return res.data?.data as LaterItem
}

export async function setLaterDone(id: string, done: boolean): Promise<LaterItem> {
  const res = await axiosInstance.post(PostEndpointUrl.LaterUpdate, { id, done })
  return res.data?.data as LaterItem
}

export async function removeLater(id: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.LaterDelete, { id })
}
