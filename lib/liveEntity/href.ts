/**
 * The one thing a OneCamp link names (Live Entity Chips): the app's page of a
 * task, a doc, a project, a board or a channel ("/app/task/<id>", as
 * lib/work/route and lib/codec/markdown's entityHref write them), relative or
 * on the app's own origin. A link to another site, to a page that names no one
 * thing, or to something under a thing's page names nothing. Pure.
 */
export interface EntityRef {
  kind: string
  id: string
}

const KINDS: ReadonlySet<string> = new Set(["task", "doc", "project", "board", "channel"])
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export function entityOfHref(href: string, origin: string): EntityRef | null {
  const text = href.trim()
  if (!text) return null
  let base: URL
  let url: URL
  try {
    base = new URL(origin)
    url = new URL(text, base)
  } catch {
    return null
  }
  if (url.origin !== base.origin) return null
  const parts = url.pathname.split("/").slice(1)
  if (parts.length === 4 && parts[3] === "") parts.pop()
  if (parts.length !== 3 || parts[0] !== "app" || !KINDS.has(parts[1]) || !ID.test(parts[2])) return null
  return { kind: parts[1], id: parts[2] }
}
