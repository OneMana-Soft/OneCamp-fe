"use client"

// One release, opened from the Releases tab (./ProjectReleases, where the
// why is): its tasks, its builds and deploys (each linked to its run), its
// notes, and, for the project's admins only (can_edit), the changes: rename,
// target day, notes (drafted by the AI when this edition has it), tasks put
// in with the project's task picker or taken out, Mark released, and Delete,
// which is soft and offers Undo (POST /restore/release/{id}). A side sheet on
// a computer; on a phone the shared drawer, its actions pinned in its footer.
// Its Burndown view (jira-04, ./ReleaseBurndown) is a chunk of its own, loaded
// when first picked: the chart's code comes only for those who look. Mark
// released asks what becomes of the unfinished tasks in a drawer of its own
// (./ShipRelease), which comes with this chunk.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/chip"
import { DateField } from "@/components/ui/date-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OverlayBody, OverlayFooter, useSheetMode } from "@/components/ui/overlay"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Textarea } from "@/components/ui/textarea"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProjectTaskPick } from "@/components/task/ProjectTaskPick"
import { useKeptTaskChoices } from "@/components/task/keptTaskChoices"
import { Check, ExternalLink, GitBranch, Plus, Sparkles, Trash2, X } from "@/lib/icons"
import { CATEGORY_KIND, type StatusCategory } from "@/lib/taskStatus"
import { busyWith } from "@/lib/ui/busyWith"
import { lazyView } from "@/lib/lazy/lazyView"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate } from "@/lib/utils/date/dateWords"
import { NAME_MOST, NOTES_MOST, doneWords, releasePath, targetWords, type Release, type ReleaseCalls, type ReleaseHttp, type ReleaseStage } from "@/lib/work/releases"
import { deletedTitle, offerUndo, restore } from "@/services/restoreService"
import { StageChip, StatePill, useKeptRead } from "./releaseParts"
import { ReleaseTaskWords, ShipRelease } from "./ShipRelease"

const BurndownView = lazyView(() => import("./ReleaseBurndown"))
const VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "burndown", label: "Burndown" },
] as const

export function ReleaseSheet({
  id,
  projectId,
  calls,
  http,
  ai,
  planned,
  failed,
  onChanged,
  onClose,
}: {
  id: string
  projectId: string
  calls: ReleaseCalls
  /** The project's planned releases, as its list read them: where Mark released may move the unfinished tasks. */
  planned: Release[]
  http: ReleaseHttp
  ai: boolean
  /** The page's shared error state, with Try again: for the release, or drawn small for a part of it (`part`). */
  failed: (retry: () => void, part?: string) => React.ReactNode
  /** Reads the list again after a change. */
  onChanged: () => Promise<unknown>
  onClose: () => void
}) {
  const load = React.useCallback(() => calls.get(id), [calls, id])
  const read = useKeptRead<Release>(releasePath(projectId, id), load)
  const r = read.data
  const sheet = useSheetMode()
  const [underWay, setUnderWay] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<(typeof VIEWS)[number]["value"]>("overview")
  const [shipping, setShipping] = React.useState(false)
  // The admin's edits, until saved; null while each is as read.
  const [name, setName] = React.useState<string | null>(null)
  const [day, setDay] = React.useState<string | null>(null)
  const [notes, setNotes] = React.useState<string | null>(null)
  const edits = r && {
    ...(name !== null && name.trim() !== r.name ? { name: name.trim() } : {}),
    ...(day !== null && day !== (r.target_date ?? "") ? { target_date: day } : {}),
    ...(notes !== null && notes !== r.notes ? { notes } : {}),
  }
  const dirty = !!edits && Object.keys(edits).length > 0

  /** Runs a change, named, then reads the release and the list again; a refusal is said above the actions. */
  const act = async (what: string, run: () => Promise<unknown>, after?: () => void) => {
    setUnderWay(what)
    setError(null)
    try {
      await run()
      after?.()
      await Promise.all([read.again(), onChanged()])
    } catch (e) {
      setError(apiErrorMessage(e, "Nothing changed. Try again."))
    }
    setUnderWay(null)
  }
  const busy = underWay !== null
  const canEdit = !!r?.can_edit
  const title = r?.name ?? "Release"

  const save = () =>
    act("save", () => calls.edit(id, edits ?? {}), () => {
      setName(null)
      setDay(null)
      setNotes(null)
    })
  const remove = async () => {
    if (!r) return
    setUnderWay("delete")
    setError(null)
    try {
      await calls.remove(id)
    } catch (e) {
      setError(apiErrorMessage(e, `“${r.name}” couldn't be deleted. Try again.`))
      setUnderWay(null)
      return
    }
    onClose()
    void onChanged()
    offerUndo(deletedTitle(r.name), () => restore(http, "release", id, onChanged), "Its tasks stay in the project.")
  }

  const footer = canEdit ? (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" className="text-danger-ink" {...busyWith(underWay, "delete")} onClick={() => void remove()}>
        <Trash2 aria-hidden />
        Delete
      </Button>
      <span className="flex-1" />
      {dirty && (
        <Button variant="outline" size="sm" {...busyWith(underWay, "save")} disabled={busyWith(underWay, "save").disabled || (name !== null && !name.trim())} onClick={() => void save()}>
          Save
        </Button>
      )}
      {r?.state === "planned" && (
        <Button size="sm" {...busyWith(underWay, "ship")} onClick={() => setShipping(true)}>
          <Check aria-hidden />
          Mark released
        </Button>
      )}
    </div>
  ) : (
    <Button variant="ghost" size="sm" onClick={onClose}>
      Close
    </Button>
  )

  const body = !r ? (
    read.failed ? (
      failed(() => void read.again())
    ) : (
      <div role="status" aria-label="Loading the release">
        <SkeletonRows rows={5} />
      </div>
    )
  ) : (
    <div data-release-sheet={r.id} className="flex flex-col gap-5 pb-2">
      <Facts release={r} canEdit={canEdit} name={name ?? r.name} day={day ?? r.target_date ?? ""} onName={setName} onDay={setDay} />
      <SegmentedControl value={view} onValueChange={setView} options={VIEWS} aria-label="Show" className="self-start" />
      {view === "burndown" ? (
        <BurndownView.View
          fallback={
            <div role="status" aria-label="Loading the burndown">
              <SkeletonRows rows={4} />
            </div>
          }
          render={(m) => <m.default release={r} projectId={projectId} calls={calls} failed={failed} />}
        />
      ) : (
        <>
          <Tasks release={r} projectId={projectId} http={http} calls={calls} canEdit={canEdit} busy={busy} act={act} failed={failed} />
          <Stages stages={r.stages} />
          <Notes release={r} canEdit={canEdit} ai={ai} value={notes ?? r.notes} onChange={setNotes} calls={calls} busy={busy} />
        </>
      )}
      {error && (
        <p role="alert" className="text-meta text-danger-ink">
          {error}
        </p>
      )}
      {shipping && (
        <ShipRelease
          release={r}
          planned={planned}
          ship={(moveTo) => calls.ship(id, moveTo)}
          onShipped={() => {
            setShipping(false)
            void Promise.all([read.again(), onChanged()])
          }}
          onClose={() => setShipping(false)}
        />
      )}
    </div>
  )

  if (sheet) {
    return (
      <ResponsiveDialog title={title} description={r ? sheetLine(r) : undefined} footer={footer} onClose={onClose}>
        {body}
      </ResponsiveDialog>
    )
  }
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent wide data-release-panel="" className="flex w-full flex-col">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{r ? sheetLine(r) : "Reading the release…"}</SheetDescription>
        </SheetHeader>
        <OverlayBody className="flex-1">{body}</OverlayBody>
        <OverlayFooter className="pt-3">{footer}</OverlayFooter>
      </SheetContent>
    </Sheet>
  )
}

/** Its line under the title, the day alone (the state reads in the pill below): "Released 14 Nov", "Due 20 Nov". */
function sheetLine(r: Release): string {
  if (r.state === "released") return r.released_at ? `Released ${shortDate(new Date(r.released_at))}` : "Released"
  const target = targetWords(r)
  return target ? `Due ${target.text}${target.late ? ", late" : ""}` : "No target day"
}

const sectionTitle = "text-ui-sm font-semibold text-ink"

function Facts({ release: r, canEdit, name, day, onName, onDay }: { release: Release; canEdit: boolean; name: string; day: string; onName: (v: string) => void; onDay: (v: string) => void }) {
  const id = React.useId()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatePill release={r} />
        <span className="text-meta text-ink-3">{doneWords(r.progress)}</span>
        {r.repo && (
          <span className="inline-flex min-w-0 items-center gap-1 text-meta text-ink-3">
            <GitBranch className="size-3" aria-hidden />
            <span className="truncate">{r.tag ? `${r.repo} · ${r.tag}` : r.repo}</span>
          </span>
        )}
      </div>
      {canEdit && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} value={name} maxLength={NAME_MOST} onChange={(e) => onName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-day`}>Target date</Label>
            <DateField id={`${id}-day`} value={day} onChange={onDay} className="w-auto" />
          </div>
        </div>
      )}
    </section>
  )
}

type Act = (what: string, run: () => Promise<unknown>, after?: () => void) => Promise<void>

function Tasks({
  release: r,
  projectId,
  http,
  calls,
  canEdit,
  busy,
  act,
  failed,
}: {
  release: Release
  projectId: string
  http: ReleaseHttp
  calls: ReleaseCalls
  canEdit: boolean
  busy: boolean
  act: Act
  failed: (retry: () => void, part: string) => React.ReactNode
}) {
  const [picking, setPicking] = React.useState(false)
  const [refused, setRefused] = React.useState<string[]>([])
  const tasks = React.useMemo(() => r.tasks ?? [], [r.tasks])
  const taken = React.useMemo(() => new Set(tasks.map((t) => t.task_uuid)), [tasks])
  // A read that failed with nothing kept says so, with Try again; one with tasks kept shows those.
  const pick = useKeptTaskChoices(http, projectId, picking, taken, (retry) => failed(retry, "this project's tasks"))
  return (
    <section className="flex flex-col gap-2" aria-label="Tasks">
      <div className="flex items-center justify-between gap-2">
        <h3 className={sectionTitle}>Tasks</h3>
        {canEdit && (
          <ProjectTaskPick
            open={picking}
            onOpenChange={setPicking}
            {...pick}
            lead={(t) => <StatusGlyph status={CATEGORY_KIND[t.task_status as StatusCategory] ?? "todo"} size={14} />}
            onPick={(t) =>
              void act(`add-${t.task_uuid}`, async () => {
                const got = await calls.addTasks(r.id, [t.task_uuid])
                setRefused(got.refused.map((x) => `“${t.task_name}”: ${x.msg}`))
              })
            }
          >
            <Button variant="ghost" size="sm" disabled={busy}>
              <Plus aria-hidden />
              Add tasks
            </Button>
          </ProjectTaskPick>
        )}
      </div>
      {refused.map((m) => (
        <p key={m} role="alert" className="text-meta text-danger-ink">
          {m}
        </p>
      ))}
      {tasks.length === 0 ? (
        <p className="text-ui-sm text-ink-3">{canEdit ? "No tasks yet. Add the tasks this release ships." : "No tasks yet."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {tasks.map((t) => (
            <li key={t.task_uuid} data-release-task={t.task_uuid} className="flex min-h-10 items-center gap-2 px-2.5 py-1.5">
              <ReleaseTaskWords task={t} />
              {t.source === "git" && <Chip className="shrink-0">From Git</Chip>}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Take “${t.task_name}” out`}
                  disabled={busy}
                  onClick={() => void act(`remove-${t.task_uuid}`, () => calls.removeTask(r.id, t.task_uuid))}
                >
                  <X aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Stages({ stages }: { stages: ReleaseStage[] }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Builds and deploys">
      <h3 className={sectionTitle}>Builds and deploys</h3>
      {stages.length === 0 ? (
        <p className="text-ui-sm text-ink-3">No build or deploy has reported on it yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {stages.map((s) => (
            <li key={`${s.kind}-${s.name}-${s.reported_at}`} data-stage={s.kind} className="flex flex-wrap items-center gap-2">
              <StageChip stage={s} />
              <span className="min-w-0 truncate text-meta text-ink-3">
                {s.kind === "deploy" ? "Deploy" : "Build"} · {s.repo}
                {s.sha ? ` @ ${s.sha.slice(0, 7)}` : ""} · {shortDate(new Date(s.reported_at))}
              </span>
              {s.url && (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-meta text-info-ink underline-offset-2 hover:underline">
                  Open the run
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Notes({ release: r, canEdit, ai, value, onChange, calls, busy }: { release: Release; canEdit: boolean; ai: boolean; value: string; onChange: (v: string) => void; calls: ReleaseCalls; busy: boolean }) {
  const id = React.useId()
  const [drafting, setDrafting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  if (!canEdit) {
    return (
      <section className="flex flex-col gap-2" aria-label="Notes">
        <h3 className={sectionTitle}>Notes</h3>
        {r.notes ? <p className="whitespace-pre-wrap text-ui-sm text-ink">{r.notes}</p> : <p className="text-ui-sm text-ink-3">No notes yet.</p>}
      </section>
    )
  }
  const draft = async () => {
    setDrafting(true)
    setError(null)
    try {
      onChange(await calls.draftNotes(r.id))
    } catch (e) {
      setError(apiErrorMessage(e, "The notes couldn't be drafted. Try again."))
    }
    setDrafting(false)
  }
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`${id}-notes`} className={sectionTitle}>
          Notes
        </Label>
        {ai && (
          <Button variant="ghost" size="sm" busy={drafting} disabled={busy} onClick={() => void draft()}>
            <Sparkles aria-hidden />
            Draft notes
          </Button>
        )}
      </div>
      <Textarea id={`${id}-notes`} value={value} maxLength={NOTES_MOST} rows={6} placeholder="What's in it, for the people it ships to." onChange={(e) => onChange(e.target.value)} />
      {error && (
        <p role="alert" className="text-meta text-danger-ink">
          {error}
        </p>
      )}
    </section>
  )
}
