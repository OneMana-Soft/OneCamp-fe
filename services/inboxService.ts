import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { fullDateTime, shortDate as dayAndMonth, shortDateTime, shortTime } from "@/lib/utils/date/shortDate"

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

// Dates are written the app's one way (lib/utils/date/shortDate): "3:10 PM"
// today, "9 Oct" otherwise, day before month. The browser's locale wrote
// "10/10/2026, 12:00:00 PM" in a header, which half the world reads as the
// tenth of a different month.

/** All of one email's date, for a tooltip: "Wednesday 1 October 2026, 3:30 PM", or the header as sent when it can't be read. */
export function fullDate(raw: string): string {
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? raw : fullDateTime(d)
}

/** One email's date in its header: "1 Oct, 3:30 PM", the year only when it isn't this one. */
export function mailDate(raw: string, now = new Date()): string {
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? raw : shortDateTime(d, now)
}

/** A conversation's date in the list: the time today, else "9 Oct". */
export function shortDate(raw: string, now = new Date()): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ""
  return d.toDateString() === now.toDateString() ? shortTime(d) : dayAndMonth(d, now)
}
