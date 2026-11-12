"use client"

// A project's releases (P10-1b web; jira-04, Jira's Releases tied to Git;
// linear-36: a release ties tasks to a deploy, with notes drafted by the AI
// edition): each with its state, target day, tasks done of all and the last
// word of its builds and deploys; opened, a side sheet on a computer and a
// drawer on a phone (./ReleaseSheet). Members read; the project's admins make
// and change them, as the server says (can_edit), so a member is offered no
// change it would refuse. A delete is soft, with Undo.
//
// A chunk of its own that imports none of the shared core (main's chunking
// rule, 30 Oct; app/releasesLazy.test): the page hands it its HTTP client,
// and the shared empty and error states (./ReleasesTab). So it reads through
// that client: what it read last is kept while the page lives, drawn at once
// when the tab opens again or the network is gone, and read again behind it,
// after each change and when the window is shown again. A write with no
// network says so where it was made (apiErrorMessage), as the backlog's do.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { DateField } from "@/components/ui/date-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { GitBranch, Plus, Rocket } from "@/lib/icons"
import { percentDone } from "@/lib/tasks/cycles"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import {
  NAME_MOST,
  doneWords,
  latestStages,
  releaseCalls,
  releasesPath,
  targetWords,
  type Release,
  type ReleaseCalls,
  type ReleaseHttp,
  type ReleaseListing,
} from "@/lib/work/releases"
import { ReleaseSheet } from "./ReleaseSheet"
import { StageChip, StatePill, useKeptRead } from "./releaseParts"

export interface ReleasesProps {
  projectId: string
  http: ReleaseHttp
  /** Whether this edition drafts notes with the AI (useAIAvailable). */
  ai: boolean
  /** The shared error state, with Try again: for the releases, or drawn small for a part of them (`part`, a menu's). */
  failed: (retry: () => void, part?: string) => React.ReactNode
  /** The shared empty state. */
  empty: (state: { title: string; description: string; action?: React.ReactNode }) => React.ReactNode
}

export default function ProjectReleases({ projectId, http, ai, failed, empty }: ReleasesProps) {
  const calls = React.useMemo(() => releaseCalls(http, projectId), [http, projectId])
  const list = useKeptRead<ReleaseListing>(releasesPath(projectId), calls.list)
  const [more, setMore] = React.useState<{ releases: Release[]; next: string } | null>(null)
  const [making, setMaking] = React.useState(false)
  const [open, setOpen] = React.useState<string | null>(null)
  const readAgain = React.useCallback(async () => {
    setMore(null)
    await list.again()
  }, [list])

  const listing = list.data
  if (!listing) return list.failed ? <div className="px-5 py-8">{failed(() => void list.again())}</div> : <Waiting />
  const canEdit = listing.can_edit
  const releases = [...listing.releases, ...(more?.releases ?? [])]
  const next = more ? more.next : listing.next_cursor
  const newRelease = canEdit ? (
    <Button size="sm" onClick={() => setMaking(true)}>
      <Plus aria-hidden />
      New release
    </Button>
  ) : undefined

  return (
    <div data-releases="" className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:px-5">
      {releases.length === 0 ? (
        empty({
          title: "No releases yet",
          description: canEdit
            ? "A release gathers the tasks that ship together, with a target day and its notes. Tag it in Git and its builds and deploys report here."
            : "A release gathers the tasks that ship together. The project's admins make them.",
          action: newRelease,
        })
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-ui-sm text-ink-3">{releases.length === 1 ? "1 release" : `${releases.length} releases`}</p>
            {newRelease}
          </div>
          {list.failed && <p role="alert" className="text-meta text-danger-ink">The releases couldn&apos;t be read again. What&apos;s shown is from before.</p>}
          <ul className="flex flex-col gap-2" aria-label="Releases">
            {releases.map((r) => (
              <li key={r.id}>
                <ReleaseRow release={r} onOpen={() => setOpen(r.id)} />
              </li>
            ))}
          </ul>
          {next && <ShowMore calls={calls} cursor={next} onMore={(got) => setMore({ releases: [...(more?.releases ?? []), ...got.releases], next: got.next_cursor })} />}
        </>
      )}
      {making && (
        <NewRelease
          calls={calls}
          onClose={() => setMaking(false)}
          onMade={(r) => {
            setMaking(false)
            setOpen(r.id)
            void readAgain()
          }}
        />
      )}
      {open && <ReleaseSheet key={open} id={open} projectId={projectId} calls={calls} http={http} ai={ai} planned={releases.filter((r) => r.state === "planned")} failed={failed} onChanged={readAgain} onClose={() => setOpen(null)} />}
    </div>
  )
}

const Waiting = () => (
  <div role="status" aria-label="Loading the releases" className="px-5 py-4">
    <SkeletonRows rows={4} />
  </div>
)

function ShowMore({ calls, cursor, onMore }: { calls: ReleaseCalls; cursor: string; onMore: (got: ReleaseListing) => void }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        busy={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            onMore(await calls.list(cursor))
          } catch (e) {
            setError(apiErrorMessage(e, "The next releases couldn't be read. Try again."))
          }
          setBusy(false)
        }}
      >
        Show more
      </Button>
      {error && <p role="alert" className="text-meta text-danger-ink">{error}</p>}
    </div>
  )
}

function ReleaseRow({ release: r, onOpen }: { release: Release; onOpen: () => void }) {
  const target = targetWords(r)
  const stages = latestStages(r.stages)
  return (
    <button
      type="button"
      data-release-row={r.id}
      onClick={onOpen}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-panel px-3 py-2.5 text-left transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <ProgressRing value={percentDone(r.progress)} size={30} label={doneWords(r.progress)}>
        <Rocket className="size-3.5 text-ink-3" aria-hidden />
      </ProgressRing>
      <span className="min-w-0">
        <span className="block truncate text-ui font-medium text-ink">{r.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-meta text-ink-3">
          {r.repo ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <GitBranch className="size-3" aria-hidden />
              <span className="truncate">{r.tag ? `${r.repo} · ${r.tag}` : r.repo}</span>
            </span>
          ) : null}
          {r.repo ? <span aria-hidden>·</span> : null}
          <span>{doneWords(r.progress)}</span>
          {r.state === "planned" && !!r.unfinished && <span aria-hidden>·</span>}
          {r.state === "planned" && !!r.unfinished && <span>{r.unfinished} unfinished</span>}
          {target && <span aria-hidden>·</span>}
          {target && <span className={cn(target.late && "text-danger-ink")}>{target.late ? `Due ${target.text}, late` : `Due ${target.text}`}</span>}
        </span>
      </span>
      <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:col-span-1 sm:justify-end">
        <StatePill release={r} />
        {stages.map((s) => (
          <StageChip key={`${s.kind}-${s.name}`} stage={s} />
        ))}
      </span>
    </button>
  )
}

function NewRelease({ calls, onClose, onMade }: { calls: ReleaseCalls; onClose: () => void; onMade: (r: Release) => void }) {
  const id = React.useId()
  const [name, setName] = React.useState("")
  const [day, setDay] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      onMade(await calls.create(name.trim(), day))
    } catch (e) {
      setError(apiErrorMessage(e, "The release couldn't be made. Try again."))
      setSaving(false)
    }
  }
  return (
    <ResponsiveDialog
      title="New release"
      description="The tasks that ship together, with a target day."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={`${id}-form`} size="sm" busy={saving} disabled={!name.trim()}>
            Make release
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <Input id={`${id}-name`} value={name} maxLength={NAME_MOST} placeholder="Spring launch" onChange={(e) => setName(e.target.value)} autoFocus required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-day`}>Target date</Label>
          <DateField id={`${id}-day`} value={day} onChange={setDay} className="w-auto" />
        </div>
        {error && (
          <p role="alert" className="text-meta text-danger-ink">
            {error}
          </p>
        )}
      </form>
    </ResponsiveDialog>
  )
}
