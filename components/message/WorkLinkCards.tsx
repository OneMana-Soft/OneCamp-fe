"use client"

// WorkLinkCards: a link to a task, doc or project in this workspace, pasted into
// a message, shows as a live card under it (Slack's Work Objects, Linear's and
// Notion's unfurls). The card reads the item as the person looking at it, through
// the same endpoints the app already uses, so it shows only what they may see:
// a link they cannot open renders no card and stays a plain link.
//
// Additive, like AgentResultCards: it never changes the message's own text, and
// renders nothing when a message links to nothing of ours.

import { useState } from "react"

import { LinkCardSkeleton } from "@/components/message/LinkCard"
import { lazyPart } from "@/lib/lazy/lazyPart"

export type WorkLinkKind = "task" | "doc" | "project"
export interface WorkLink {
  kind: WorkLinkKind
  id: string
}

const LINK = /(https?:\/\/[^\s"'<>/]+)?\/app\/(task|doc|project)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/**
 * The links to this workspace's tasks, docs and projects in a message, in
 * order, once each, at most `max`. A link to another host is another
 * workspace's, and is left alone. Pure, for its test.
 */
export function workLinksIn(raw: string, host: string, max = 3): WorkLink[] {
  if (!raw || raw.indexOf("/app/") === -1) return []
  const out: WorkLink[] = []
  const seen = new Set<string>()
  for (const m of raw.matchAll(LINK)) {
    const origin = m[1]
    if (origin) {
      try {
        if (new URL(origin).host !== host) continue
      } catch {
        continue
      }
    }
    const kind = m[2].toLowerCase() as WorkLinkKind
    const id = m[3].toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ kind, id })
    if (out.length >= max) break
  }
  return out
}

type CardsProps = { links: WorkLink[]; codeWaited: boolean }
const CardsComing = ({ links }: CardsProps) => links.map((l) => <LinkCardSkeleton key={l.id} />)

// The cards' code loads with the first message that has a card (every
// conversation page carried it, 21 Oct); each link keeps a skeleton at the
// card's size meanwhile. Offline, the links stay links and the conversation
// carries on (lazyPart tries again once back online).
const cards = lazyPart<CardsProps>(() => import("@/components/message/workLinkCardsBody").then((m) => m.default), { placeholder: CardsComing, failed: () => null })

export function WorkLinkCards({ text }: { text: string }) {
  const host = typeof window === "undefined" ? "" : window.location.host
  const links = workLinksIn(text || "", host)
  // Read once: cards that waited for their code fade in when it lands.
  const [codeWaited] = useState(() => !cards.isIn())
  if (links.length === 0) return null
  // 8px under the body, 6px between cards (C07's rhythm).
  return (
    // /collapse hides link cards with the pictures (app/globals.css).
    <div data-work-cards="" data-message-media="" className="mt-2 flex flex-col gap-1.5 empty:hidden">
      <cards.Part links={links} codeWaited={codeWaited} />
    </div>
  )
}
