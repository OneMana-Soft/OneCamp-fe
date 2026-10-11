/**
 * The pure parts of the Mail page (hub.md §5), tested without a page.
 */
import { senderName, type InboxMessage } from "@/services/inboxService"

/** The address inside a From header: "Maya Chen <maya@acme.com>" is maya@acme.com. */
export function senderAddress(from: string): string {
  const m = /<([^>]+)>/.exec(from)
  if (m) return m[1].trim()
  return from.includes("@") ? from.trim() : ""
}

/**
 * Which messages of a conversation start folded (I6): with more than three,
 * every one but the last two is a 44px row of who and the first words, opened
 * in place on a click. Returns the indexes that start folded.
 */
export function foldedAtStart(count: number): Set<number> {
  const out = new Set<number>()
  if (count <= 3) return out
  for (let i = 0; i < count - 2; i++) out.add(i)
  return out
}

/**
 * A body split at its quoted history (Gmail's gmail_quote block, or the first
 * blockquote), so the history sits behind a "···" pill. Returns the body
 * whole and no quote when there is nothing quoted, or nothing before it.
 */
export function splitQuoted(html: string): { body: string; quoted: string } {
  const at = html.search(/<div[^>]*class="[^"]*gmail_quote[^"]*"|<blockquote\b/i)
  if (at <= 0) return { body: html, quoted: "" }
  const body = html.slice(0, at)
  if (!body.replace(/<[^>]*>/g, "").trim()) return { body: html, quoted: "" }
  return { body, quoted: html.slice(at) }
}

/** "3 messages · Maya Chen, you": who wrote in it, the reader as "you". */
export function threadByline(messages: InboxMessage[], myAddress?: string): string {
  const names: string[] = []
  for (const m of messages) {
    const mine = myAddress && senderAddress(m.from).toLowerCase() === myAddress.toLowerCase()
    const name = mine ? "you" : senderName(m.from)
    if (name && !names.includes(name)) names.push(name)
  }
  const n = messages.length
  return [`${n} ${n === 1 ? "message" : "messages"}`, names.join(", ")].filter(Boolean).join(" · ")
}

export type InboxKey = "next" | "prev" | "open" | "back" | "summarise" | "task" | "reply" | "gmail" | "search"

/** The page's keys (Linear and Superhuman): J/K, ↵, Esc, S, T, R, O and /. */
export function inboxKeyAction(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): InboxKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  switch (e.key) {
    case "j":
    case "ArrowDown":
      return "next"
    case "k":
    case "ArrowUp":
      return "prev"
    case "Enter":
      return "open"
    case "Escape":
      return "back"
    case "s":
      return "summarise"
    case "t":
      return "task"
    case "r":
      return "reply"
    case "o":
      return "gmail"
    case "/":
      return "search"
    default:
      return null
  }
}
