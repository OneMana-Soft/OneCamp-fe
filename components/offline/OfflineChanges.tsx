"use client"

import * as React from "react"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Button } from "@/components/ui/button"
import { busyWith } from "@/lib/ui/busyWith"
import type { Op } from "@/lib/offline/outbox"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectMembers } from "@/hooks/useProjectFields"
import { useStatusLabel } from "@/components/task/taskStatusCell"
import { dueDateOf } from "@/components/task/DueLabel"
import { shortDate } from "@/lib/utils/date/dateWords"
import { NO_PRIORITY, TASK_PRIORITIES } from "@/types/taskScale"

/**
 * The changes made offline that need the member (projects P7-1): a field a
 * teammate changed while they were away (Keep mine / Keep theirs), a change
 * the server kept failing (Retry / Discard), and a change that can't be sent
 * because what it belongs to was never made (Discard). A dialog on a computer; on a phone the shared sheet, its actions
 * in the pinned footer.
 */

const FIELD: Record<string, string> = {
  task_name: "Name",
  task_status: "Status",
  task_priority: "Priority",
  task_start_date: "Start date",
  task_due_date: "Due date",
  task_assignee: "Assignee",
}

/** A value as the member would say it: in the words the rest of the app uses for it. */
export function FieldValue({ op, value }: { op: Op; value: unknown }) {
  const text = value === null || value === undefined ? "" : String(value)
  if (op.field === "task_status") return <StatusWords projectId={op.parent} value={text} />
  if (op.field === "task_assignee") return <PersonWords projectId={op.parent} id={text} />
  if (op.field === "task_priority") return <>{TASK_PRIORITIES.find((p) => p.value === text)?.label ?? NO_PRIORITY.label}</>
  if (op.field === "task_start_date" || op.field === "task_due_date") {
    const d = dueDateOf(text)
    return <>{d ? shortDate(d) : "No date"}</>
  }
  return <>{text || "None"}</>
}

function StatusWords({ projectId, value }: { projectId?: string; value: string }) {
  const { options } = useProjectStatuses(projectId)
  const label = useStatusLabel(options.find((o) => o.value === value))
  return <>{label || "Another status"}</>
}

function PersonWords({ projectId, id }: { projectId?: string; id: string }) {
  const { nameOf } = useProjectMembers(id ? projectId : undefined)
  return <>{id ? nameOf(id) ?? "A member" : "No one"}</>
}

function name(op: Op): string {
  return op.label ? `“${op.label}”` : "A task"
}

export function OfflineChanges({
  conflicts,
  failed,
  held,
  onKeep,
  onRetry,
  onDiscard,
  onClose,
}: {
  conflicts: Op[]
  failed: Op[]
  held: Op[]
  onKeep(seq: number, choice: "mine" | "theirs"): Promise<void>
  onRetry(seq: number): Promise<void>
  onDiscard(seq: number): Promise<void>
  onClose(): void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    try {
      await work()
    } finally {
      setBusy(null)
    }
  }
  const total = conflicts.length + failed.length + held.length
  const one = total === 1 && conflicts.length === 1 ? conflicts[0] : null

  React.useEffect(() => {
    if (total === 0) onClose()
  }, [total, onClose])

  const footer = one ? (
    <>
      <Button variant="outline" {...busyWith(busy, `t${one.seq}`)} onClick={() => void run(`t${one.seq}`, () => onKeep(one.seq!, "theirs"))} data-offline-keep="theirs">
        Keep theirs
      </Button>
      <Button {...busyWith(busy, `m${one.seq}`)} onClick={() => void run(`m${one.seq}`, () => onKeep(one.seq!, "mine"))} data-offline-keep="mine">
        Keep mine
      </Button>
    </>
  ) : (
    <Button variant="outline" onClick={onClose}>
      Done
    </Button>
  )

  return (
    <ResponsiveDialog
      title={total === 1 ? "A change needs you" : `${total} changes need you`}
      description="Made while you were offline. Nothing is sent until you choose."
      onClose={onClose}
      footer={footer}
    >
      <ul className="grid gap-2" data-offline-changes="">
        {conflicts.map((op) => (
          <li key={op.seq} className="grid gap-2 rounded-lg border border-line p-3" data-offline-conflict={op.seq}>
            <p className="text-ui-sm text-ink">
              {name(op)}: <span className="font-medium">{FIELD[op.field ?? ""] ?? "A field"}</span> was changed by someone else while you were offline.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-meta">
              <dt className="text-ink-3">Yours</dt>
              <dd className="min-w-0 truncate font-medium text-ink"><FieldValue op={op} value={op.value} /></dd>
              <dt className="text-ink-3">Now</dt>
              <dd className="min-w-0 truncate text-ink-2"><FieldValue op={op} value={op.theirs} /></dd>
            </dl>
            {one ? null : (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" {...busyWith(busy, `t${op.seq}`)} onClick={() => void run(`t${op.seq}`, () => onKeep(op.seq!, "theirs"))}>
                  Keep theirs
                </Button>
                <Button size="sm" {...busyWith(busy, `m${op.seq}`)} onClick={() => void run(`m${op.seq}`, () => onKeep(op.seq!, "mine"))}>
                  Keep mine
                </Button>
              </div>
            )}
          </li>
        ))}
        {failed.map((op) => (
          <li key={op.seq} className="grid gap-2 rounded-lg border border-line p-3" data-offline-failed={op.seq}>
            <p className="text-ui-sm text-ink">
              {name(op)}: the change to <span className="font-medium">{FIELD[op.field ?? ""] ?? "a field"}</span> keeps failing on the server.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" {...busyWith(busy, `d${op.seq}`)} onClick={() => void run(`d${op.seq}`, () => onDiscard(op.seq!))}>
                Discard
              </Button>
              <Button size="sm" {...busyWith(busy, `r${op.seq}`)} onClick={() => void run(`r${op.seq}`, () => onRetry(op.seq!))}>
                Retry
              </Button>
            </div>
          </li>
        ))}
        {held.map((op) => (
          <li key={op.seq} className="grid gap-2 rounded-lg border border-line p-3" data-offline-held={op.seq}>
            <p className="text-ui-sm text-ink">
              {name(op)}: this change can&apos;t be sent, because what it belongs to wasn&apos;t created.
            </p>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" {...busyWith(busy, `d${op.seq}`)} onClick={() => void run(`d${op.seq}`, () => onDiscard(op.seq!))}>
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </ResponsiveDialog>
  )
}
