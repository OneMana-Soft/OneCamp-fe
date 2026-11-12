"use client"

// The Inbox badge: the server's count; one asked before or during a seen write is stale (C1).
import { useEffect } from "react"
import { useDispatch } from "react-redux"
import useSWR from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { setTotalUnreadActivityCount } from "@/store/slice/userSlice"

export const INBOX_UNREAD = "/activity/unread"

let era = 0
let writing = 0

export function seenWrite(): () => void {
  era++
  writing++
  return () => {
    era++
    writing--
  }
}

type Answer = { count?: unknown; era: number }

const read = async (url: string): Promise<Answer> => {
  const asked = era
  // @ts-expect-error a quiet read: no loading bar, no toast
  const res = await axiosInstance.get(url, { suppressErrorToast: true, silent: true })
  return { count: res.data?.data?.count, era: asked }
}

export function useInboxBadge() {
  const dispatch = useDispatch()
  const { data } = useSWR(INBOX_UNREAD, read, { refreshInterval: 240_000, revalidateOnFocus: true })
  useEffect(() => {
    if (data && data.era === era && !writing && typeof data.count === "number") dispatch(setTotalUnreadActivityCount({ count: data.count }))
  }, [data, dispatch])
}
