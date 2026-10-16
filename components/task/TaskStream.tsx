"use client"

import { memo, useMemo, type ReactNode } from "react"

import type { TaskActivityInterface } from "@/types/task"
import type { CommentInfoInterface } from "@/types/comment"
import { buildStream, collapseHistory } from "@/lib/tasks/activityStream"
import { EarlierHistoryButton, HistoryLineView } from "@/components/task/taskActivitySection"
import type { EarlierHistory } from "@/hooks/useEarlierHistory"

/**
 * A task's comments and history as one stream in time order (design v3,
 * work.md W32): history as quiet one-line entries (a burst of one person's
 * changes folded into one), and each run of comments drawn by the caller, so
 * the comments keep their own component, reactions and editing.
 */
function TaskStream({
  activities,
  comments,
  renderComments,
  earlier,
}: {
  activities: TaskActivityInterface[] | undefined
  comments: CommentInfoInterface[]
  /** Draws comments[start, end) with their real indexes. */
  renderComments: (start: number, end: number) => ReactNode
  /** Older history lines than these exist: a way to them at the top (hooks/useEarlierHistory). */
  earlier?: Pick<EarlierHistory, "more" | "loading" | "loadEarlier">
}) {
  const items = useMemo(() => buildStream(collapseHistory(activities), comments), [activities, comments])
  if (items.length === 0) return <p className="py-6 text-center text-ui-sm text-ink-3">Nothing here yet.</p>
  return (
    <div className="flex flex-col gap-1" data-stream="">
      <EarlierHistoryButton earlier={earlier} />
      {items.map((item) =>
        item.kind === "history" ? (
          <HistoryLineView key={`h-${item.first.activity_uuid ?? item.at}`} line={item} />
        ) : (
          <div key={`c-${item.start}`} className="py-1">
            {renderComments(item.start, item.end)}
          </div>
        ),
      )}
    </div>
  )
}

export default memo(TaskStream)
