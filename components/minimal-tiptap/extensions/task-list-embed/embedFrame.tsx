"use client"

import type * as React from "react"
import { Button } from "@/components/ui/button"
import { Lock } from "@/lib/icons"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"
import type { useProjectBoard } from "@/hooks/useProjectBoard"
import type { LiveEntityState } from "@/lib/liveEntity/types"

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

/** What an embed has read, in the shape its states need: a project's tasks or board, a whiteboard. */
export interface EmbedRead {
  state: LiveEntityState
  failed: boolean
  retry(): void
  loading: boolean
  /** There is something to show. */
  ready: boolean
}

/** What an embed says in place of what it shows, in its own words. */
export interface EmbedWords {
  guest: string
  none: string
  gone: string
  failed: string
}

/**
 * What an embed shows in place of its content (docs C1; a whiteboard,
 * miro-34): to a guest, that it shows for people in the workspace; to someone
 * who can't open it, that they can't see it, never its name; that it was
 * deleted; that it couldn't be read, with Try again; a skeleton while it
 * loads. Null once there is something to show.
 */
export function embedNote({
  guest,
  missing,
  read,
  words,
  skeleton,
}: {
  guest: boolean
  /** The block names nothing to read. */
  missing: boolean
  read: EmbedRead
  words: EmbedWords
  skeleton: React.ReactNode
}): React.ReactNode | null {
  if (guest) return <EmbedNote>{words.guest}</EmbedNote>
  if (missing || read.state === "none")
    return (
      <EmbedNote>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden="true" />
          {words.none}
        </span>
      </EmbedNote>
    )
  if (read.state === "gone") return <EmbedNote>{words.gone}</EmbedNote>
  if (read.failed)
    return (
      <EmbedNote action={<Button size="sm" variant="secondary" onClick={read.retry}>Try again</Button>}>
        <SaysLoadFailure />
        {words.failed}
      </EmbedNote>
    )
  if (read.loading || !read.ready) return skeleton
  return null
}

/** A project's embed (docs C1): its tasks or its board, in a project's words. `what` is "tasks" or "board". */
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
  return embedNote({
    guest,
    missing: !projectId,
    read: { state: read.project.state, failed: read.failed, retry: read.retry, loading: read.loading, ready: !!read.board },
    words: {
      guest: `${what === "tasks" ? "A project's tasks show" : "A project's board shows"} here for people in the workspace.`,
      none: `You can't see this project's ${what}. Ask someone in it to add you.`,
      gone: "This project was deleted.",
      failed: loadFailedWords(what),
    },
    skeleton,
  })
}

/** What an embed says when its read failed: embedNote draws it beside SaysLoadFailure. */
export const loadFailedWords = (what: string) => `Couldn't load the ${what}.`
