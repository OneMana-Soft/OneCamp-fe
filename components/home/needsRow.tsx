"use client"

/**
 * A needs row's lead and second line (hub.md H8): one anatomy for Home's
 * "What needs me now" and My tasks' requests waiting for an answer, drawn in
 * a HubRow by each.
 */
import type { ReactNode } from "react"

import { ChatFace } from "@/components/message/chatFace"
import { Chip } from "@/components/ui/chip"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { Shield } from "@/lib/icons"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { cn } from "@/lib/utils/helpers/cn"
import type { NeedsItem } from "@/components/home/needsMe"

/** The row's 24px lead: the agent, a task's status, or who it's from. */
export function NeedsLead({ item }: { item: NeedsItem }) {
  if (item.kind === "agent") return <span className="block size-6"><AgentAvatar /></span>
  if (item.kind === "due") return <StatusGlyph status={item.status ?? "todo"} />
  // An agent or a bot is its square, never a person's disc (design v3 §3.9),
  // as on the greeting's orbit: OneCamp AI's unread DM drew an "OA" disc.
  if (item.person?.bot) return <ChatFace name={item.person.name} userUUID={item.person.id} isBot size={24} />
  if (item.person) return <IdentityMark variant="avatar" size={24} id={avatarSeed(item.person.name)} label={item.person.name} />
  return <StatusGlyph status="todo" />
}

/** A mention's words, with the reader's own mention as the brand-muted "@You" chip. */
function Quote({ text }: { text: string }) {
  const parts = text.split(/(@You)/)
  return (
    <span className="text-ui-sm text-ink-2">
      {parts.map((p, i) =>
        p === "@You" ? (
          <span key={i} className="hub-me mr-0.5 text-meta leading-4">
            @You
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

/** The row's second line: what it's about, by kind. */
export function NeedsSecond({ item }: { item: NeedsItem }): ReactNode {
  if (item.kind === "agent") {
    return (
      <span className="inline-flex items-center gap-1.5">
        {item.context ? <span>{item.context}</span> : null}
        {item.context ? <span className="text-ink-4">·</span> : null}
        <Shield className="size-3 text-agent" aria-hidden />
        acts for you
      </span>
    )
  }
  // A task due, and an approval asked by a date: the due chip, then (an
  // approval's) what is asked, then the project. What is asked gives way
  // first, with "…", down to a couple of words; past that the project yields
  // whole, onto a second line that its one-line box clips, still read by a
  // screen reader. Shrinking side by side, "Q4 launch" was cut to "Q".
  if (item.kind === "due" || item.kind === "approval") {
    const ask = item.kind === "approval" ? item.quote : undefined
    const project = item.project ? (
      <span className={cn("flex min-w-0 items-center gap-1.5", ask && "shrink-0")}>
        <ProjectTile id={item.project.id} size={14} />
        <span className="min-w-0 truncate">{item.project.name}</span>
      </span>
    ) : null
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        {item.due ? (
          <Chip tone={item.overdue ? "danger" : "sun"} className="h-[18px] shrink-0 px-1.5 text-micro">
            {item.due}
          </Chip>
        ) : null}
        {ask ? (
          <span className="flex h-[1lh] min-w-0 flex-1 flex-wrap items-center gap-x-1.5 overflow-hidden">
            <span className="min-w-0 max-w-max flex-[1_1_6em] truncate">{ask}</span>
            {project}
          </span>
        ) : (
          project
        )}
      </span>
    )
  }
  if (item.quote) return <Quote text={item.quote} />
  return item.context
}
