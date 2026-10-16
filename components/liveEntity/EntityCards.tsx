"use client"

import { parseISO } from "date-fns"
import { ChatFace } from "@/components/message/chatFace"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { DueLabel } from "@/components/task/DueLabel"
import { CATEGORY_KIND, isClosedStatus } from "@/lib/taskStatus"
import { useToday, type TaskChipData } from "@/lib/liveEntity"
import { fullDate } from "@/lib/utils/date/shortDate"

/** One line of a card: what it is, and its value. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-2 text-ui-sm">
      <span className="w-16 shrink-0 text-ink-3">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-ink">{children}</span>
    </div>
  )
}

/**
 * A task's card (the hover card on a task chip): its status, name, project,
 * who has it and when it's due, as its panel says them.
 */
export function TaskCard({ data }: { id: string; data: TaskChipData }) {
  const today = useToday()
  return (
    <div data-entity-card="task" className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-meta text-ink-2">
        <StatusGlyph status={CATEGORY_KIND[data.status] ?? "todo"} size={14} />
        {data.status_name}
      </div>
      <p className="text-heading text-ink">{data.name || "Untitled task"}</p>
      <div className="flex flex-col">
        {data.project_name ? <Row label="Project">{<span className="truncate">{data.project_name}</span>}</Row> : null}
        <Row label="Assignee">
          {data.assignee ? (
            <>
              <ChatFace name={data.assignee.name} profileKey={data.assignee.avatar_key} userUUID={data.assignee.uuid} size={18} />
              <span className="truncate">{data.assignee.name}</span>
            </>
          ) : (
            <span className="text-ink-3">No one yet</span>
          )}
        </Row>
        {data.due ? (
          <Row label="Due">
            <span title={fullDate(parseISO(data.due))}>
              <DueLabel date={parseISO(data.due)} done={isClosedStatus(data.status)} now={parseISO(today)} />
            </span>
          </Row>
        ) : null}
      </div>
    </div>
  )
}
