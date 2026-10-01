import axiosInstance from "@/lib/axiosInstance"

// The person's own Gmail inside OneCamp. The server reads it with the Gmail
// connection they made, sanitises every body and drops remote images.

export interface InboxThread {
  id: string
  subject: string
  from: string
  snippet: string
  date: string
  unread: boolean
  messages: number
}

export interface InboxPage {
  threads: InboxThread[]
  next_page_token?: string
}

export interface InboxMessage {
  id: string
  from: string
  to: string
  cc?: string
  date: string
  subject: string
  /** Sanitised HTML. */
  body: string
  truncated?: boolean
  attachments?: number
}

export interface InboxThreadDetail {
  id: string
  subject: string
  messages: InboxMessage[]
  gmail_url: string
}

export async function getInbox(q = "", pageToken = ""): Promise<InboxPage> {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (pageToken) params.set("page_token", pageToken)
  const res = await axiosInstance.get(`/connectors/gmail/inbox${params.toString() ? `?${params}` : ""}`)
  const d = res.data?.data ?? {}
  return { threads: d.threads ?? [], next_page_token: d.next_page_token }
}

export async function getInboxThread(id: string): Promise<InboxThreadDetail> {
  const res = await axiosInstance.get(`/connectors/gmail/threads/${encodeURIComponent(id)}`)
  return res.data?.data
}

export async function replyToThread(id: string, body: string): Promise<void> {
  await axiosInstance.post(`/connectors/gmail/threads/${encodeURIComponent(id)}/reply`, { body })
}

/** The server answers 409 with this code when Gmail is not connected. */
export function isNotConnected(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { code?: string } } }
  return e?.response?.status === 409 && e?.response?.data?.code === "not_connected"
}

/** "Priya Sharma <priya@x.com>" -> "Priya Sharma"; a bare address stays as is. */
export function senderName(from: string): string {
  const m = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from)
  return (m && m[1].trim()) || from.replace(/[<>]/g, "").trim()
}

/** A short, local date for the list: time today, else day and month. */
export function shortDate(raw: string, now = new Date()): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}
