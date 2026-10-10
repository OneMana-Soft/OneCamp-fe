// Messages shown before the server has them.
//
// WHY. A message used to appear only when the server answered, 300 to 800 ms
// after Send on the demo (longer on a slow link), and then only if the list
// still ended where the send began; a second message sent before the first
// came back could stay missing until the realtime echo. Slack, Linear and every
// messenger people use show it at once. Now the message is in the conversation
// the moment Send is pressed, marked as sending; the server's answer gives it
// its real id and time, or marks it as not sent, with Try again, Edit and
// Delete beside it.
//
// The list keeps one row for it throughout: it is keyed by the local id it was
// given at Send, which it keeps once confirmed, so the row is never remounted.

export type SendState = "sending" | "failed"

let counter = 0

/** An id for a message that has none from the server yet. */
export function newLocalId(): string {
  counter = (counter + 1) % 1e6
  return `local-${Date.now().toString(36)}-${counter.toString(36)}`
}

export function isLocalId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("local-")
}

/** A message's words without markup, for telling the realtime echo of a send apart. */
export function plainText(html: string | undefined | null): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/** How a slice's message type is read for the helpers below. */
export interface PendingAccess<T> {
  localId: (m: T) => string | undefined
  id: (m: T) => string | undefined
  author: (m: T) => string | undefined
  html: (m: T) => string | undefined
  state: (m: T) => SendState | undefined
}

/** Where the message sent with this local id is, or -1. */
export function indexOfLocal<T>(list: readonly T[], a: PendingAccess<T>, localId: string): number {
  return list.findIndex((m) => a.localId(m) === localId)
}

/**
 * The message sent from here that a realtime echo is the server's copy of: the
 * oldest unconfirmed one by the same author with the same words. A message
 * marked not sent counts too: its answer was lost, but the server has it.
 * -1 when there is none, and the echo is a message of its own (sent from
 * another device, say).
 */
export function indexOfEchoed<T>(list: readonly T[], a: PendingAccess<T>, author: string | undefined, html: string | undefined): number {
  if (!author) return -1
  const words = plainText(html)
  return list.findIndex((m) => a.state(m) !== undefined && a.author(m) === author && plainText(a.html(m)) === words)
}

/**
 * Whether a message other than the one at `except` already has this server id:
 * the realtime echo of a send, added before the send's own answer came back.
 */
export function hasServerIdElsewhere<T>(list: readonly T[], a: PendingAccess<T>, id: string, except: number): boolean {
  return list.some((m, i) => i !== except && a.id(m) === id)
}

/** The row key for a message: the local id it was sent with, else the server's. */
export function rowKey(localId: string | undefined, id: string): string {
  return localId || id
}
