// The classes rich content may carry, wherever it's rendered.
//
// WHY. The app's stylesheet has a utility class for nearly anything, so a
// class in a message, a doc or an email lays out the page as the app's own
// markup would: class="fixed inset-0 z-50 bg-background" turned a message
// into a full-screen overlay that could pose as a sign-in page. Content keeps
// only the classes the editor itself writes: paragraphs, headings, lists and
// quotes, inline code, links, mentions, task lists and a code block's
// language. Everything else is dropped.

const KEPT = new Set([
  "text-node",
  "heading-node",
  "block-node",
  "list-node",
  "inline",
  "link",
  "mention",
  "channel-mention",
  "entity-mention",
  "hover:cursor-pointer",
  "task-list",
  "task-item",
])

// A code block's language, as the editor writes it on its <code>.
const LANGUAGE = /^language-[a-z0-9+#._-]{1,32}$/i

/** The classes in `value` that content may keep, space-separated; "" when none. Pure. */
export function contentClasses(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .split(/\s+/)
    .filter((c) => KEPT.has(c) || LANGUAGE.test(c))
    .join(" ")
}
