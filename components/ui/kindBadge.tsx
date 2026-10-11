/**
 * The kind badge on a feed row's lead (hub.md A5): a 16px circle with a 2px
 * ring in the row's surface, holding a 10px glyph. One per kind of thing that
 * happened, so a reader tells a mention from an assignment at a glance without
 * reading the sentence. A refusal is the agent's tint with a shield: the
 * permission system answering, never the danger red.
 */
import type { ReactNode } from "react"

import { AtSign, CheckCircle2, Clock, MessageSquare, Plug, Reply, Shield, UserPlus } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"

export type KindBadgeKind =
  | "mention"
  | "reply"
  | "reaction"
  | "assigned"
  | "due"
  | "comment"
  | "agent"
  | "refused"
  | "invite"
  | "app"

/** Fill and glyph colour per kind, as classes on the v3 tokens. */
export const KIND_BADGE_TONE: Record<KindBadgeKind, string> = {
  mention: "bg-brand-muted text-brand-text",
  reply: "bg-camp-sky-tint text-camp-sky-ink",
  reaction: "bg-sheet",
  assigned: "bg-camp-moss-tint text-camp-moss-ink",
  due: "bg-camp-sun-tint text-camp-sun-ink",
  comment: "bg-camp-lake-tint text-camp-lake-ink",
  agent: "bg-agent-muted text-agent-ink",
  refused: "bg-agent-muted text-agent-ink",
  invite: "bg-camp-sun-tint text-camp-sun-ink",
  app: "bg-hover text-ink-2",
}

const GLYPH: Record<Exclude<KindBadgeKind, "reaction">, ReactNode> = {
  mention: <AtSign />,
  reply: <Reply />,
  assigned: <CheckCircle2 />,
  due: <Clock />,
  comment: <MessageSquare />,
  agent: <Spark className="size-2.5" />,
  refused: <Shield />,
  invite: <UserPlus />,
  app: <Plug />,
}

export function KindBadge({ kind, emoji, className }: { kind: KindBadgeKind; emoji?: string; className?: string }) {
  return (
    <span aria-hidden data-kind-badge={kind} className={cn("hub-kind-badge", KIND_BADGE_TONE[kind], className)}>
      {kind === "reaction" ? <span className="text-micro leading-none">{emoji || "👍"}</span> : GLYPH[kind]}
    </span>
  )
}
