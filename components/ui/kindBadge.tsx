/**
 * The kind badge on a feed row's lead (hub.md A5): a 16px circle with a 2px
 * ring in the row's surface, holding a 10px glyph. One per kind of thing that
 * happened, so a reader tells a mention from an assignment at a glance without
 * reading the sentence. A refusal is the agent's tint with a shield: the
 * permission system answering, never the danger red.
 *
 * A row with no one behind its sentence (a rule's own notice) has no face for
 * the badge to sit on, so the kind itself leads: `lead` draws the same badge at
 * the face's size (32 in a feed row, 24 in compact), in the face's place, with
 * no ring.
 */
import type { ReactNode } from "react"

import { AtSign, CheckCircle2, Clock, MessageSquare, Plug, Reply, Shield, UserPlus, Workflow } from "@/lib/icons"
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
  | "rule"

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
  // The project's Rules wear dusk (their empty state, ProjectRulesDialog).
  rule: "bg-camp-dusk-tint text-camp-dusk-ink",
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
  // The Rules tool's own glyph (ProjectToolButtons, "Rules that run work").
  rule: <Workflow />,
}

/** The badge as a row's lead: the face's size and place, its glyph half that. */
const LEAD = {
  24: "static size-6 shadow-none [&_svg]:size-3",
  32: "static size-8 shadow-none [&_svg]:size-4",
} as const

export function KindBadge({ kind, emoji, lead, className }: { kind: KindBadgeKind; emoji?: string; lead?: keyof typeof LEAD; className?: string }) {
  return (
    <span aria-hidden data-kind-badge={kind} data-lead={lead} className={cn("hub-kind-badge", lead && LEAD[lead], KIND_BADGE_TONE[kind], className)}>
      {kind === "reaction" ? <span className={cn("leading-none", lead ? "text-sm" : "text-micro")}>{emoji || "👍"}</span> : GLYPH[kind]}
    </span>
  )
}
