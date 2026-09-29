import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"

// Turning a message into a task: the draft the task form opens with, and the
// reply left under the message once the task exists. Pure, so both are tested
// without a store or a network.

/** The message a task is being made from. */
export interface TaskSource {
  /** Channel post the message is, when it is one. */
  postUUID?: string
  /** Direct or group chat message the message is, when it is one. */
  chatMessageID?: string
  /** Absolute link that opens the message in its thread. */
  link: string
  /** Who wrote it, for the "From" line. */
  authorName?: string
}

export interface TaskDraft {
  name: string
  description: string
}

const NAME_MAX = 120

function escapeHTML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * The task's name is the message's first sentence, cut on a word boundary so
 * it never ends mid-word. The person edits it before saving; this only saves
 * them retyping the gist.
 */
export function taskNameFromText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return ""
  const sentence = flat.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? flat
  if (sentence.length <= NAME_MAX) return sentence.replace(/[.]$/, "")
  const cut = sentence.slice(0, NAME_MAX)
  const space = cut.lastIndexOf(" ")
  return (space > NAME_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "") + "…"
}

/**
 * Draft for a task made from a message: the name from its first sentence, and
 * a description that quotes the message and links back to it, so whoever picks
 * the task up can read the conversation it came from.
 */
export function taskDraftFromMessage(messageHTML: string | undefined, source: TaskSource): TaskDraft {
  const text = htmlToPreviewText(messageHTML, 4000)
  const from = source.authorName ? `${escapeHTML(source.authorName)}'s message` : "the message"
  const quote = text ? `<blockquote><p>${escapeHTML(text)}</p></blockquote>` : ""
  return {
    name: taskNameFromText(text),
    description: `${quote}<p>From <a href="${escapeHTML(source.link)}">${from}</a></p>`,
  }
}

/** The reply posted under the message once its task exists. */
export function taskMadeReply(origin: string, taskUUID: string, taskName: string): string {
  const href = `${origin}/app/task/${encodeURIComponent(taskUUID)}`
  return `<p>Made this a task: <a href="${escapeHTML(href)}">${escapeHTML(taskName)}</a></p>`
}
