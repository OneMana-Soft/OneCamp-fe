import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

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
  const res = await axiosInstance.get(`/connectors/gmail/inbox${params.toString() ? `?${params}` : ""}`, OWN_ERRORS)
  const d = res.data?.data ?? {}
  return { threads: d.threads ?? [], next_page_token: d.next_page_token }
}

export async function getInboxThread(id: string): Promise<InboxThreadDetail> {
  const res = await axiosInstance.get(`/connectors/gmail/threads/${encodeURIComponent(id)}`, OWN_ERRORS)
  return res.data?.data
}

export async function replyToThread(id: string, body: string): Promise<void> {
  await axiosInstance.post(`/connectors/gmail/threads/${encodeURIComponent(id)}/reply`, { body }, OWN_ERRORS)
}

export type ConnectionProblem = "not_connected" | "reconnect" | "demo"

/**
 * The server answers 409 with a code when the page should offer a button rather
 * than an error: "not_connected" (never connected), "reconnect" (the Google
 * connection expired, was revoked, or lacks a permission), or "demo" (the
 * public demo's shared visitor, who can never connect one).
 */
export function connectionProblem(err: unknown): ConnectionProblem | null {
  const e = err as { response?: { status?: number; data?: { code?: string } } }
  if (e?.response?.status !== 409) return null
  const code = e.response.data?.code
  return code === "not_connected" || code === "reconnect" || code === "demo" ? code : null
}

/** "Priya Sharma <priya@x.com>" -> "Priya Sharma"; a bare address stays as is. */
export function senderName(from: string): string {
  const m = /^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/.exec(from)
  return (m && m[1].trim()) || from.replace(/[<>]/g, "").trim()
}

/** A full local date for one email, or the header as sent when it cannot be read. */
export function fullDate(raw: string): string {
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString()
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
