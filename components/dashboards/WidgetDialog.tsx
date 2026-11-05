"use client"

// Add a widget to a dashboard, or change one (B9-b3). A widget is a question:
// what it shows (its kind and, for a number, which; for a breakdown, by what;
// for a goal, which goal), about which projects, over how many weeks, and how
// wide it sits. The server checks it again (business/Dashboard CheckWidget)
// and works it out as each reader.

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGoals } from "@/hooks/useGoals"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { BREAKDOWNS, KINDS, MAX_NAME, MEASURES, SIZES, kindOf, type BreakdownBy, type MetricMeasure, type Widget, type WidgetKind, type WidgetQuery } from "@/lib/dashboards"
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

export function WidgetDialog({
  editing,
  inProject,
  onSave,
  onClose,
}: {
  /** The widget being changed; none to add one. */
  editing?: Widget
  /** A project's dashboard reads that project alone, so it has no projects to pick. */
  inProject: boolean
  onSave: (w: Pick<Widget, "kind" | "title" | "query" | "w" | "h">) => Promise<unknown>
  onClose: () => void
}) {
  const [kind, setKind] = useState<WidgetKind>(editing?.kind ?? "metric")
  const [title, setTitle] = useState(editing?.title ?? "")
  const [measure, setMeasure] = useState<MetricMeasure>(editing?.query.measure ?? "open")
  const [by, setBy] = useState<BreakdownBy>(editing?.query.by ?? "project")
  const [goal, setGoal] = useState(editing?.query.goal ?? "")
  const [project, setProject] = useState(editing?.query.projects?.length === 1 ? editing.query.projects[0] : ALL)
  const [weeks, setWeeks] = useState(String(editing?.query.weeks || 12))
  const [width, setWidth] = useState(String(editing?.w ?? kindOf("metric").w))
  const [busy, setBusy] = useState(false)
  const about = kindOf(kind)
  // Several projects a widget was given elsewhere stay as they were unless one is picked here.
  const kept = editing?.query.projects && editing.query.projects.length > 1 && project === ALL ? editing.query.projects : undefined
  const ready = kind !== "goal" || !!goal

  const pickKind = (k: WidgetKind) => {
    setKind(k)
    if (!editing) setWidth(String(kindOf(k).w))
  }

  const save = async () => {
    if (!ready || busy) return
    const query: WidgetQuery =
      kind === "goal"
        ? { goal }
        : {
            ...(editing?.query.filters?.length ? { filters: editing.query.filters } : {}),
            ...(editing?.query.search ? { search: editing.query.search } : {}),
            projects: inProject ? undefined : kept ?? (project === ALL ? undefined : [project]),
            weeks: Number(weeks),
            ...(kind === "metric" ? { measure } : {}),
            ...(kind === "breakdown" ? { by } : {}),
          }
    setBusy(true)
    try {
      await onSave({ kind, title: title.trim(), query, w: Number(width), h: editing && editing.kind === kind ? editing.h : about.h })
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
          <DialogTitle>{editing ? "Edit the widget" : "Add a widget"}</DialogTitle>
          <DialogDescription>Everyone who opens this dashboard sees it worked out from the work they may see.</DialogDescription>
        </DialogHeader>
        <form
          id="widget-form"
          className="-mx-1 grid min-h-0 gap-4 overflow-y-auto px-1"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
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
                  {BREAKDOWNS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind === "goal" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="widget-goal">Goal</Label>
              <GoalPick value={goal} onChange={setGoal} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {!inProject && (
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
