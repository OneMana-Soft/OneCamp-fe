"use client"

// Add a widget to a dashboard, or change one (B9-b3). A widget is a question:
// what it shows (its kind and, for a number, which; for a breakdown, by what;
// for a goal, which goal), about which projects, over how many weeks, and how
// wide it sits. The server checks it again (business/Dashboard CheckWidget)
// and works it out as each reader. Its source is projects (its own copy of
// which, and of any filters it was added with) or one of the keeper's saved
// views (B9-b4: the view's id alone, its filters read from the view each
// time). Add to dashboard (AddToDashboard) is this editor with a dashboard
// picked above it and a source already set.

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGoals } from "@/hooks/useGoals"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { useTaskViews } from "@/hooks/useTaskViews"
import { useProjectFields } from "@/hooks/useProjectFields"
import { readableFields } from "@/components/task/hiddenField"
import {
  BREAKDOWN_MEASURES,
  BREAKDOWNS,
  KINDS,
  MAX_NAME,
  MEASURES,
  SIZES,
  kindOf,
  type BreakdownBy,
  type BreakdownMeasure,
  type MetricMeasure,
  type Widget,
  type WidgetKind,
  type WidgetQuery,
} from "@/lib/dashboards"
import { scopeProject, taskViewScope } from "@/lib/tasks/views"
import { REPORT_WEEKS } from "@/lib/reports"

const ALL = "all"

/** The goal picker: the goals the reader may see, open ones. */
function GoalPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { goals, isLoading } = useGoals()
  const open = (goals ?? []).filter((g) => g.status === "open" || g.id === value)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="widget-goal" aria-label="Goal">
        <SelectValue placeholder={isLoading ? "Loading goals…" : open.length ? "Pick a goal" : "No open goals"} />
      </SelectTrigger>
      <SelectContent>
        {open.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The projects picker: all the reader's, or one of them. */
function ProjectPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { projects } = useProjectsOverview()
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="widget-projects" aria-label="Projects">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All the projects I&apos;m in</SelectItem>
        {(projects ?? []).map((p) => (
          <SelectItem key={p.project_uuid} value={p.project_uuid}>
            {p.project_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The saved view picker: the reader's views of a list (My Tasks or a project's; a project's dashboard, that project's alone). */
function ViewPick({ project, list, onList, value, onChange }: { project?: string; list: string; onList: (scope: string) => void; value: string; onChange: (id: string) => void }) {
  const { projects } = useProjectsOverview()
  const { views, isLoading } = useTaskViews(project ? taskViewScope(project) : list, true)
  const none = !isLoading && views.length === 0
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!project && (
        <div className="grid gap-1.5">
          <Label htmlFor="widget-view-list">List</Label>
          <Select
            value={list}
            onValueChange={(v) => {
              onList(v)
              onChange("")
            }}
          >
            <SelectTrigger id="widget-view-list" aria-label="List">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={taskViewScope()}>My Tasks</SelectItem>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.project_uuid} value={taskViewScope(p.project_uuid)}>
                  {p.project_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="widget-view">Saved view</Label>
        <Select value={value} onValueChange={onChange} disabled={none}>
          <SelectTrigger id="widget-view" aria-label="Saved view">
            <SelectValue placeholder={isLoading ? "Loading views…" : none ? "None yet" : "Pick a view"} />
          </SelectTrigger>
          <SelectContent>
            {views.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {none && <p className="text-xs text-ink-2">No saved views in this list yet. Save one from its Display menu.</p>}
      </div>
    </div>
  )
}

export type WidgetFields = Pick<Widget, "kind" | "title" | "query" | "w" | "h">

export function WidgetDialog({
  editing,
  viewName,
  preset,
  project: dashboardProject,
  others,
  head,
  heading,
  blocked,
  onSave,
  onClose,
}: {
  /** The widget being changed; none to add one. */
  editing?: Widget
  /** The saved view the widget (or the preset) reads, named when the reader may read it. */
  viewName?: string
  /** What a new widget starts as: Add to dashboard's source, and the chart it came from. */
  preset?: { kind?: WidgetKind; query: WidgetQuery }
  /** A project's dashboard reads that project alone, so it has no projects to pick, and its views are that project's. */
  project?: string
  /** Whether anyone else opens the dashboard: a saved view's numbers are its owner's alone (V-557). */
  others: boolean
  /** Drawn above the widget's own fields (Add to dashboard's dashboard picker). */
  head?: ReactNode
  heading?: string
  /** Add waits while this is set (no dashboard to add to yet). */
  blocked?: boolean
  onSave: (w: WidgetFields) => Promise<unknown>
  onClose: () => void
}) {
  const start = editing?.query ?? preset?.query ?? {}
  const [kind, setKind] = useState<WidgetKind>(editing?.kind ?? preset?.kind ?? "metric")
  const [title, setTitle] = useState(editing?.title ?? "")
  const [measure, setMeasure] = useState<MetricMeasure>(MEASURES.find((m) => m.value === start.measure)?.value ?? "open")
  const [by, setBy] = useState<BreakdownBy>(start.by ?? "project")
  const [split, setSplit] = useState<BreakdownMeasure>(start.measure === "effort" ? "effort" : "count")
  const [goal, setGoal] = useState(start.goal ?? "")
  const [project, setProject] = useState(start.projects?.length === 1 ? start.projects[0] : ALL)
  const [source, setSource] = useState<"projects" | "view">(start.view ? "view" : "projects")
  const [view, setView] = useState(start.view ?? "")
  // A view it reads already stays, named or not, until another is chosen.
  const [choosing, setChoosing] = useState(!start.view)
  const [list, setList] = useState(taskViewScope())
  // A project's dashboard offers its project's views alone: picking another dashboard (Add to dashboard) asks again
  // for a view picked here, and keeps the rest, so the dialog stays drawn and its way in stays known (CR-B14 M3).
  const [viewsOf, setViewsOf] = useState(dashboardProject)
  if (viewsOf !== dashboardProject) {
    setViewsOf(dashboardProject)
    setView(start.view ?? "")
    setChoosing(!start.view)
  }
  const [weeks, setWeeks] = useState(String(start.weeks || 12))
  const [width, setWidth] = useState(String(editing?.w ?? kindOf(editing?.kind ?? preset?.kind ?? "metric").w))
  const [busy, setBusy] = useState(false)
  const about = kindOf(kind)
  const inProject = !!dashboardProject
  // Several projects a widget was given elsewhere stay as they were unless one is picked here.
  const kept = start.projects && start.projects.length > 1 && project === ALL ? start.projects : undefined
  const overView = kind !== "goal" && source === "view"
  const ready = !blocked && (kind === "goal" ? !!goal : overView ? !!view : true)
  // A breakdown of one project's work (the dashboard's, the one picked, a saved view's list) splits by its own fields
  // too, as its list reads them; never by one the server hides from its reader (V-698: a money field, to anyone not
  // an admin of its project), as the server slices.
  const oneProject = dashboardProject ?? (overView ? scopeProject(list) : project !== ALL ? project : undefined)
  const { fields } = useProjectFields(kind === "breakdown" ? oneProject : undefined)
  const splits = [...BREAKDOWNS, ...readableFields(fields).map((f) => ({ value: `field:${f.id}` as const, label: `By ${f.name}` }))]
  // A field it splits by already stays offered while the fields load, or from another project's list.
  if (!splits.some((b) => b.value === by)) splits.push({ value: by as `field:${string}`, label: editing?.title.trim() || "By its field" })

  const pickKind = (k: WidgetKind) => {
    setKind(k)
    if (!editing) setWidth(String(kindOf(k).w))
  }

  const save = async () => {
    if (!ready || busy) return
    const asks = { weeks: Number(weeks), ...(kind === "metric" ? { measure } : {}), ...(kind === "breakdown" ? { by, measure: split } : {}) }
    // A breakdown by a field is named after it: the widget's data names only the field's values.
    const named = title.trim() || (kind === "breakdown" && by.startsWith("field:") ? (splits.find((b) => b.value === by)?.label ?? "") : "")
    const query: WidgetQuery =
      kind === "goal"
        ? { goal }
        : overView
          ? { view, ...asks }
          : {
              ...(start.filters?.length ? { filters: start.filters } : {}),
              ...(start.search ? { search: start.search } : {}),
              projects: inProject ? undefined : kept ?? (project === ALL ? undefined : [project]),
              ...asks,
            }
    setBusy(true)
    try {
      await onSave({ kind, title: named, query, w: Number(width), h: editing && editing.kind === kind ? editing.h : about.h })
      onClose()
    } catch {
      // The server's refusal is shown already; the dialog stays to fix it.
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{heading ?? (editing ? "Edit the widget" : "Add a widget")}</DialogTitle>
          <DialogDescription>{others ? "Everyone who opens this dashboard sees it worked out from the work they may see." : "Only you see this dashboard."}</DialogDescription>
        </DialogHeader>
        <form
          id="widget-form"
          className="-mx-1 grid min-h-0 gap-4 overflow-y-auto px-1"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          {head}
          <div className="grid gap-1.5">
            <Label htmlFor="widget-kind">Shows</Label>
            <Select value={kind} onValueChange={(v) => pickKind(v as WidgetKind)}>
              <SelectTrigger id="widget-kind" aria-label="Shows">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-ink-2">{about.about}</p>
          </div>
          {kind === "metric" && (
            <div className="grid gap-1.5">
              <Label htmlFor="widget-measure">Number</Label>
              <Select value={measure} onValueChange={(v) => setMeasure(v as MetricMeasure)}>
                <SelectTrigger id="widget-measure" aria-label="Number">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASURES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "breakdown" && (
            <div className="grid gap-1.5">
              <Label htmlFor="widget-by">Split</Label>
              <Select value={by} onValueChange={(v) => setBy(v as BreakdownBy)}>
                <SelectTrigger id="widget-by" aria-label="Split">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {splits.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "breakdown" && (
            <div className="grid gap-1.5">
              <Label htmlFor="widget-split-measure">Measure</Label>
              <Select value={split} onValueChange={(v) => setSplit(v as BreakdownMeasure)}>
                <SelectTrigger id="widget-split-measure" aria-label="Measure">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BREAKDOWN_MEASURES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-ink-2">{split === "effort" ? "The open and done work's estimates: points where a project counts them, else hours." : "The tasks open, overdue and done."}</p>
            </div>
          )}
          {kind === "goal" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="widget-goal">Goal</Label>
              <GoalPick value={goal} onChange={setGoal} />
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="widget-source">Reads</Label>
                <Select value={source} onValueChange={(v) => setSource(v as "projects" | "view")}>
                  <SelectTrigger id="widget-source" aria-label="Reads">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projects">Projects</SelectItem>
                    <SelectItem value="view">A saved view</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {source === "view" &&
                (choosing ? (
                  <ViewPick project={dashboardProject} list={list} onList={setList} value={view} onChange={setView} />
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2" data-widget-view="">
                    <p className="min-w-0 truncate text-sm">{viewName ?? "A saved view only its owner can see"}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setChoosing(true)
                        setView("")
                      }}
                    >
                      Choose another view
                    </Button>
                  </div>
                ))}
              {source === "view" && others && (choosing || viewName) && (
                <p className="text-xs text-ink-2" data-view-note="">
                  Unlike the rest of this dashboard, only you will see this widget&apos;s numbers: a saved view is yours alone, so everyone else sees a note in its place.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {source === "projects" && !inProject && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="widget-projects">Projects</Label>
                    {kept ? <p className="text-sm text-ink-2">The {kept.length} projects it was given</p> : <ProjectPick value={project} onChange={setProject} />}
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="widget-weeks">Weeks</Label>
                  <Select value={weeks} onValueChange={setWeeks}>
                    <SelectTrigger id="widget-weeks" aria-label="Weeks">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_WEEKS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          The last {n} weeks
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="widget-title">Name</Label>
              <Input id="widget-title" value={title} maxLength={MAX_NAME} placeholder={kind === "metric" ? MEASURES.find((m) => m.value === measure)?.label : about.label} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="widget-width">Width</Label>
              <Select value={width} onValueChange={setWidth}>
                <SelectTrigger id="widget-width" aria-label="Width">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => (
                    <SelectItem key={s.w} value={String(s.w)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="widget-form" disabled={!ready} busy={busy}>
            {editing ? "Save" : "Add widget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
