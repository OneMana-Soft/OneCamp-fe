"use client"

import * as React from "react"
import { parseISO } from "date-fns"
import { ChatFace } from "@/components/message/chatFace"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { DueLabel } from "@/components/task/DueLabel"
import { usePost } from "@/hooks/usePost"
import { entityKind, followHref, refreshEntity, useLiveEntity, useToday, type TaskChipData } from "@/lib/liveEntity"
import type { BoardEmbed } from "@/lib/board/cards"
import { CardShell, EmbedFrame, UseHint, type CardPointer } from "./boardEmbeds"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { CATEGORY_KIND, isClosedStatus } from "@/lib/taskStatus"
import { ArrowUpRight, Check, Lock } from "@/lib/icons"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"
import { PostEndpointUrl } from "@/services/endPoints"

/**
 * A member's card on the board (lib/board/cards says which links are cards):
 * a OneCamp thing read live, as this reader may see it (lib/liveEntity). The
 * server decides every read, so a thing they can't open says "No access" and
 * never its name, and a change heard on its topic draws at once. A task's card
 * says its status, key, name, who has it and when it's due, and someone who
 * may change it ticks it done here, with the request the project's own list
 * makes. Other sites are framed as boardEmbeds frames them, and a guest's
 * board draws boardEmbeds alone, so it never loads the app's store.
 *
 * Excalidraw gives the box the pointer only while the card is active (a press
 * on the middle of a card), so a card moves, resizes and copies like any
 * element, and its buttons answer once it's open.
 */
export function BoardEmbedView({ embed, pointer = null }: { embed: NonNullable<BoardEmbed>; pointer?: CardPointer }) {
  if ("frame" in embed) return <EmbedFrame embed={embed} />
  return <LiveCard kind={embed.card.kind} id={embed.card.id} pointer={pointer} />
}

const NOUN_CAP = (noun: string) => noun.charAt(0).toUpperCase() + noun.slice(1)

function LiveCard({ kind, id, pointer }: { kind: string; id: string; pointer: CardPointer }) {
  const spec = entityKind<unknown>(kind)
  const live = useLiveEntity<unknown>(kind, id)
  const today = useToday()
  const router = useAppRouter()
  const noun = spec?.noun ?? "item"

  const open = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    if (spec?.open?.(id, live.data, e.currentTarget)) return
    const href = spec?.href(id, live.data)
    if (href) followHref(href, e, router.push)
  }
  const openButton = (
    <button
      type="button"
      onClick={open}
      aria-label={`Open the ${noun}`}
      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
    >
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </button>
  )

  if (live.state === "loading") {
    return (
      <CardShell kind={kind} state="loading" label={`Loading a ${noun}`} pointer={pointer}>
        <span className="h-3 w-1/3 rounded bg-hover" />
        <span className="h-4 w-4/5 rounded bg-hover" />
      </CardShell>
    )
  }
  if (live.state !== "ok" || live.data === undefined || !spec) {
    const words = live.state === "none" ? "No access" : live.state === "gone" ? `This ${noun} was deleted` : `Couldn't load this ${noun}`
    return (
      <CardShell kind={kind} state={live.state} label={words} pointer={pointer}>
        <span className="flex items-center gap-1.5 text-ui-sm text-ink-3">
          {live.state === "none" ? <Lock className="size-3.5" aria-hidden="true" /> : null}
          {words}
          {live.state === "error" ? <SaysLoadFailure /> : null}
        </span>
        {live.state === "error" ? (
          <button
            type="button"
            onClick={() => refreshEntity(kind, id)}
            className="mt-auto self-start rounded-md px-2 py-1 text-meta font-[510] text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            Try again
          </button>
        ) : null}
      </CardShell>
    )
  }

  if (kind === "task") return <TaskFace id={id} task={live.data as TaskChipData} today={today} openButton={openButton} pointer={pointer} />

  const v = spec.view(live.data as never, id, { today })
  return (
    <CardShell kind={kind} state="ok" label={`${NOUN_CAP(noun)}: ${v.title}`} pointer={pointer}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="flex-1 text-meta text-ink-3">{NOUN_CAP(noun)}</span>
        <UseHint pointer={pointer} />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {v.lead}
        <p className="min-w-0 flex-1 truncate text-ui font-[510] text-ink">{v.title}</p>
        {v.tag ? <span className="shrink-0 text-meta tabular-nums text-ink-3">{v.tag}</span> : null}
        {openButton}
      </div>
    </CardShell>
  )
}

function TaskFace({ id, task, today, openButton, pointer }: { id: string; task: TaskChipData; today: string; openButton: React.ReactNode; pointer: CardPointer }) {
  const post = usePost()
  const [ticking, setTicking] = React.useState(false)
  const done = isClosedStatus(task.status)
  const name = task.name || "Untitled task"

  // Done or open again, as the project's own list ticks it: the same request, through the shared poster.
  const tick = async () => {
    if (ticking) return
    setTicking(true)
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.UpdateTaskStatus,
        payload: { task_status: done ? "todo" : "done", task_uuid: id, task_project_uuid: task.project_id },
      })
    } finally {
      setTicking(false)
      refreshEntity("task", id)
    }
  }

  return (
    <CardShell kind="task" state="ok" label={`Task: ${name}`} pointer={pointer}>
      <div className="flex min-w-0 items-center gap-1.5 text-meta text-ink-2">
        <StatusGlyph status={CATEGORY_KIND[task.status] ?? "todo"} size={14} />
        <span className="truncate">{task.status_name}</span>
        <span className="flex-1" />
        <UseHint pointer={pointer} />
        {task.key ? <span className="shrink-0 font-medium tabular-nums text-ink-3">{task.key}</span> : null}
      </div>
      <p className={cn("line-clamp-2 text-ui font-[510] text-ink", done && "text-ink-2 line-through")}>{name}</p>
      <div className="mt-auto flex min-w-0 items-center gap-1.5 text-meta text-ink-2">
        {task.assignee ? (
          <>
            <ChatFace name={task.assignee.name} profileKey={task.assignee.avatar_key} userUUID={task.assignee.uuid} size={18} />
            <span className="min-w-0 truncate">{task.assignee.name}</span>
          </>
        ) : (
          <span className="text-ink-3">No one yet</span>
        )}
        <span className="flex-1" />
        {task.due ? <DueLabel date={parseISO(task.due)} done={done} now={parseISO(today)} /> : null}
        {task.can_edit ? (
          <button
            type="button"
            onClick={tick}
            aria-busy={ticking || undefined}
            aria-pressed={done}
            aria-label={done ? `Open ${name} again` : `Mark ${name} done`}
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
              done && "text-success-ink",
              ticking && "opacity-60",
            )}
          >
            <Check className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {openButton}
      </div>
    </CardShell>
  )
}
