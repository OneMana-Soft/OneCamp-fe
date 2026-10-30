/**
 * Which kept suggestions an open doc shows (docs C5): every open one the doc's
 * list holds, from people, agents and the AI kept for later, drawn in the doc
 * for whoever may read it; and what the review bar calls each. Pure.
 */

import type { JSONContent } from "@tiptap/core"
import type { Fragment, Schema } from "@tiptap/pm/model"
import { Fragment as PMFragment } from "@tiptap/pm/model"
import type { EditProposal } from "@/lib/proposals/types"

/** Whether a kept proposal still has changes to decide. */
export const isOpen = (p: EditProposal) => p.status === "open" || p.status === "partial"

/**
 * What to change in an editor that shows activeIds: the open proposals it
 * doesn't show yet, and the ones it shows that the list says were decided or
 * taken back. A proposal the list doesn't hold (one being written here, an AI
 * answer under review) is never dropped.
 */
export function planSync(listed: EditProposal[], activeIds: Iterable<string>): { show: EditProposal[]; drop: string[] } {
  const active = new Set(activeIds)
  const show: EditProposal[] = []
  const drop: string[] = []
  for (const p of listed) {
    if (isOpen(p)) {
      if (!active.has(p.id)) show.push(p)
    } else if (active.has(p.id)) {
      drop.push(p.id)
    }
  }
  return { show, drop }
}

/** What the review bar calls a kept proposal, for the person looking at it. */
export function reviewerLabel(p: EditProposal, selfUUID: string): string {
  switch (p.author_kind) {
    case "person":
      if (selfUUID && p.author_uuid === selfUUID) return "Your suggestion"
      return `Suggested by ${p.author_name || "a teammate"}`
    case "agent":
      return p.author_name ? `Suggested by ${p.author_name}, an agent` : "Suggested by an agent"
    default:
      return "AI suggestion, kept for review"
  }
}

/**
 * The words typed in the composer as doc content: one line goes into the
 * text where it stands; more lines are paragraphs of their own, as a pasted
 * answer is.
 */
export function contentOfText(schema: Schema, text: string): Fragment {
  const lines = text.split(/\n+/).map((l) => l.trim())
  if (lines.length <= 1) return text ? PMFragment.from(schema.text(text)) : PMFragment.empty
  return PMFragment.fromArray(lines.filter(Boolean).map((l) => schema.nodes.paragraph.create(null, schema.text(l))))
}

/** The words in some codec content, blocks on lines of their own. */
export function textOfContent(nodes: JSONContent[] | undefined): string {
  const out: string[] = []
  const walk = (n: JSONContent) => {
    if (typeof n.text === "string") out.push(n.text)
    for (const c of n.content ?? []) walk(c)
  }
  for (const n of nodes ?? []) {
    if (out.length && n.type !== "text" && n.type !== "hardBreak") out.push("\n")
    walk(n)
  }
  return out.join("").trim()
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/**
 * A suggestion in a few words, as a list says it: "“Friday” to “Monday”",
 * "Add “big”", "Take out “really”", and how many more changes it holds.
 */
export function changeSummary(p: Pick<EditProposal, "hunks">): string {
  const open = p.hunks.filter((h) => !h.decision)
  const h = open[0] ?? p.hunks[0]
  if (!h) return "No changes"
  const before = clip(textOfContent(h.before))
  const after = clip(textOfContent(h.after))
  let first: string
  if (before && after) first = `“${before}” to “${after}”`
  else if (after) first = `Add “${after}”`
  else if (before) first = `Take out “${before}”`
  else first = "A change to the layout"
  const more = Math.max(0, (open.length || p.hunks.length) - 1)
  return more ? `${first}, and ${more} more ${more === 1 ? "change" : "changes"}` : first
}
