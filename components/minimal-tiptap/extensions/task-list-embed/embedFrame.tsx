"use client"

import type * as React from "react"
import { Button } from "@/components/ui/button"
import { Lock } from "@/lib/icons"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"
import type { useProjectBoard } from "./useProjectBoard"

/** A frame for the embed: its head, then what it shows. */
export function EmbedFrame({ selected, head, children }: { selected: boolean; head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      contentEditable={false}
      className={cn("my-2 overflow-hidden rounded-xl bg-raised shadow-e1", selected && "ring-2 ring-brand/50")}
    >
      <div className="flex min-h-9 items-center gap-2 border-b border-line px-3 py-1.5 text-ui-sm text-ink-2">{head}</div>
      {children}
    </div>
  )
}

/** What an embed says when it has no tasks to show: why, never an empty box (I19). */
export function EmbedNote({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-3 text-ui-sm text-ink-3">
      <span>{children}</span>
      {action}
    </div>
  )
}

/**
 * What a project's embed shows in place of its tasks (docs C1): to a guest,
 * that it shows for people in the workspace; to someone outside the project,
 * that they can't see it, never its name; that it was deleted; that it
 * couldn't be read, with Try again; a skeleton while it loads. Null once
 * there is a board to show. `what` is "tasks" or "board".
 */
export function embedState({
  guest,
  projectId,
  read,
  what,
  skeleton,
}: {
  guest: boolean
  projectId: string
  read: ReturnType<typeof useProjectBoard>
  what: "tasks" | "board"
  skeleton: React.ReactNode
}): React.ReactNode | null {
  if (guest) return <EmbedNote>{what === "tasks" ? "A project's tasks show" : "A project's board shows"} here for people in the workspace.</EmbedNote>
  if (!projectId || read.project.state === "none")
    return (
      <EmbedNote>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden="true" />
          You can&apos;t see this project&apos;s {what}. Ask someone in it to add you.
        </span>
      </EmbedNote>
    )
  if (read.project.state === "gone") return <EmbedNote>This project was deleted.</EmbedNote>
  if (read.failed)
    return (
      <EmbedNote action={<Button size="sm" variant="secondary" onClick={read.retry}>Try again</Button>}>
        <SaysLoadFailure />
        Couldn&apos;t load the {what}.
      </EmbedNote>
    )
  if (read.loading || !read.board) return skeleton
  return null
}
