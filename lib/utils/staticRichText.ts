// Whether a stored message body can be shown without building an editor.
//
// WHY. Every message in a channel, DM, thread or preview mounted a full
// read-only Tiptap editor just to display its HTML: fifteen editors for one
// six-message channel, 290 ms of main-thread work on a slower laptop, and each
// body appearing a beat after its row (the editor renders nothing until it
// exists), which is the layout shift a channel had. Plain text, formatting,
// links and person mentions render the same from the stored HTML, sanitised.
// Anything that needs a live node view (code highlighting, images, tables,
// task lists, task and doc references) still gets the editor.

const NEEDS_EDITOR = /<(pre|img|table|iframe|video|audio)\b|data-checked|data-type="task/i

/** True when the stored HTML renders faithfully without an editor. Pure. */
export function canRenderStatically(html: unknown): html is string {
  if (typeof html !== "string") return false
  if (NEEDS_EDITOR.test(html)) return false
  const types = [...html.matchAll(/data-type="([^"]*)"/gi)].map((m) => m[1].toLowerCase())
  return types.every((t) => t === "mention")
}

/** The user a clicked mention points at: its id, before any "@uid" suffix. */
export function mentionUserUUID(id: string | null | undefined): string {
  return (id || "").split("@")[0]
}
