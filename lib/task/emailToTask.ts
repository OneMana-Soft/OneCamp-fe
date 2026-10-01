import type { TaskDraft, TaskSource } from "@/lib/task/messageToTask"

function escapeHTML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * The task form's draft for an email: its subject as the name, and a quote
 * with a link back to the email in Gmail as the description. The source has
 * no post or chat message, so nothing is posted back anywhere.
 */
export function taskFromEmail(
  subject: string,
  from: string,
  text: string,
  gmailURL: string,
): { draft: TaskDraft; source: TaskSource } {
  const name = (subject || "Follow up on email").replace(/^\s*(re|fwd?):\s*/i, "").trim() || "Follow up on email"
  const quote = text.trim() ? `<blockquote><p>${escapeHTML(text.trim().slice(0, 1500))}</p></blockquote>` : ""
  const who = from ? `${escapeHTML(from)}'s email` : "the email"
  return {
    draft: {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      description: `${quote}<p>From <a href="${escapeHTML(gmailURL)}">${who}</a></p>`,
      text: text.trim(),
    },
    source: { link: gmailURL, authorName: from || undefined },
  }
}
