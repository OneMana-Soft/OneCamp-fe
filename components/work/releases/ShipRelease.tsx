"use client"

// Mark released (jira-04 part 4), from a planned release's sheet
// (./ReleaseSheet), for the project's admins: a drawer that lists the
// release's unfinished tasks and asks what becomes of them, as Complete cycle
// does (the shared CarryChoice): kept in it (no move, as before), moved to
// another of the project's planned releases, or taken out of any. POST
// .../ship {move_to?}: the server marks it released and moves them in one
// write. A refusal is said here in the server's own words and nothing
// changes. A dialog on a computer; on a phone the shared drawer, its actions
// pinned in its footer. It comes with the sheet's chunk, never on a route's
// first load, and reaches none of the shared core (app/releasesLazy.test).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { CarryChoice, itOrThem } from "@/components/work/carryChoice"
import { Check } from "@/lib/icons"
import { CATEGORY_KIND, isClosedStatus, type StatusCategory } from "@/lib/taskStatus"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { SHIP_TAKE_OUT, type Release, type ReleaseTask } from "@/lib/work/releases"

/** A release's task as a line reads: its status, its key and its name (here and in the sheet's task list). */
export function ReleaseTaskWords({ task: t }: { task: ReleaseTask }) {
  return (
    <>
      <StatusGlyph status={CATEGORY_KIND[t.task_status as StatusCategory] ?? "todo"} size={16} />
      {t.task_key && <span className="shrink-0 text-meta text-ink-3 tabular-nums">{t.task_key}</span>}
      <span className="min-w-0 flex-1 truncate text-ui-sm text-ink">{t.task_name}</span>
    </>
  )
}

const KEEP = "keep"

export function ShipRelease({
  release: r,
  planned,
  ship,
  onShipped,
  onClose,
}: {
  release: Release
  /** The project's planned releases, as its list read them: where its unfinished tasks may go. */
  planned: Release[]
  /** Marks it released: its unfinished tasks stay with no `moveTo`, or go to a release's id, or out of any (SHIP_TAKE_OUT). */
  ship: (moveTo?: string) => Promise<unknown>
  onShipped: () => void
  onClose: () => void
}) {
  const open = (r.tasks ?? []).filter((t) => !isClosedStatus(t.task_status))
  const others = planned.filter((o) => o.id !== r.id && o.state === "planned")
  const [to, setTo] = React.useState<string>(KEEP)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const them = itOrThem(open.length)

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await ship(to === KEEP ? undefined : to)
    } catch (e) {
      setError(apiErrorMessage(e, "Nothing changed. Try again."))
      setBusy(false)
      return
    }
    onShipped()
  }

  return (
    <ResponsiveDialog
      title={`Mark ${r.name} released`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" busy={busy} onClick={() => void go()}>
            <Check aria-hidden />
            Mark released
          </Button>
        </>
      }
    >
      <div className="grid gap-3" data-ship-release={r.id}>
        <CarryChoice
          open={open.length}
          ask={others.length ? `Keep ${them} in it, move ${them} to another release, or take ${them} out?` : `Keep ${them} in it or take ${them} out?`}
          value={to}
          onChange={setTo}
          options={[
            { value: KEEP, label: `Keep ${them} in ${r.name}` },
            ...others.map((o) => ({ value: o.id, label: `Move ${them} to ${o.name}` })),
            { value: SHIP_TAKE_OUT, label: `Take ${them} out of ${r.name}` },
          ]}
        >
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" aria-label="Unfinished tasks">
            {open.map((t) => (
              <li key={t.task_uuid} className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
                <ReleaseTaskWords task={t} />
              </li>
            ))}
          </ul>
        </CarryChoice>
        {error && (
          <p role="alert" className="text-meta text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </ResponsiveDialog>
  )
}
