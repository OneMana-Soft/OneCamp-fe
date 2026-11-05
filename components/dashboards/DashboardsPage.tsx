"use client"

// Dashboards (B9-b3: jira-08, asana-08, linear-32): yours, the workspace's
// and each project's, beside the Projects views. A dashboard is a page of
// widgets the server works out as whoever opens it (business/Dashboard), so a
// shared one never shows a reader work they may not see. Its keepers (you for
// yours; a workspace's admins; a project's admins) add, change, move and
// remove widgets, share it, rename it and delete it, each with Undo; everyone
// else it is shared with reads it. A computer lays it on a 12-column grid; a
// phone shows the same widgets as one column, in the same order.

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardWidget } from "@/components/dashboards/DashboardWidget"
import { WidgetDialog } from "@/components/dashboards/WidgetDialog"
import { VIEWS } from "@/components/project/overviewViews"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { WorkTabs } from "@/components/task/WorkTabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotWelcome } from "@/components/ui/graphics/spots"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useUndoToast } from "@/components/ui/undoToast"
import { useMedia } from "@/context/MediaQueryContext"
import { useDashboard, useDashboardLists } from "@/hooks/useDashboards"
import { useProjectsOverview } from "@/hooks/useProjectsOverview"
import { areaHue } from "@/lib/areas"
import { MAX_NAME, MAX_WIDGETS, dashboardHref, flowPlaces, moved, ordered, samePlaces, scopeWords, type Dashboard, type DashboardScope, type Widget } from "@/lib/dashboards"
import { Globe, LayoutDashboard, Lock, Pencil, Plus, Trash2, Users } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

const MINE = "mine-and-workspace"

/** Make a dashboard, or rename and share one. */
function DashboardDialog({
  editing,
  places,
  onSave,
  onClose,
}: {
  editing?: Dashboard
  /** Where one may be made: yours always, the workspace's for its admins, a project's for its admins. */
  places: { scope: DashboardScope; label: string }[]
  onSave: (input: { name: string; scope: DashboardScope; shared: boolean }) => Promise<unknown>
  onClose: () => void
}) {
  const [name, setName] = useState(editing?.name ?? "")
  const [scope, setScope] = useState<DashboardScope>(editing?.scope ?? places[0]?.scope ?? "mine")
  const [shared, setShared] = useState(editing?.shared ?? true)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onSave({ name: name.trim(), scope, shared: scope !== "mine" && shared })
      onClose()
    } catch {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Rename and share" : "New dashboard"}</DialogTitle>
          <DialogDescription>Widgets on it show each reader the work they may see.</DialogDescription>
        </DialogHeader>
        <form
          id="dashboard-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard-name">Name</Label>
            <Input id="dashboard-name" value={name} maxLength={MAX_NAME} autoFocus placeholder="Weekly review" onChange={(e) => setName(e.target.value)} />
          </div>
          {!editing && places.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="dashboard-scope">For</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as DashboardScope)}>
                <SelectTrigger id="dashboard-scope" aria-label="For">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {places.map((p) => (
                    <SelectItem key={p.scope} value={p.scope}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scope !== "mine" && (
            <label className="flex items-start justify-between gap-4 text-sm">
              <span>
                <span className="font-[510]">Shared</span>
                <span className="mt-0.5 block text-xs text-ink-2">
                  {scope === "project" ? "Everyone in the project reads it; otherwise only its admins." : "Everyone in the workspace reads it; otherwise only its admins."}
                </span>
              </span>
              <Switch checked={shared} onCheckedChange={setShared} aria-label="Shared" />
            </label>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="dashboard-form" disabled={!name.trim()} busy={busy}>
            {editing ? "Save" : "Make it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ScopeIcon = ({ d }: { d: Pick<Dashboard, "scope" | "shared"> }) => {
  const Icon = d.scope === "mine" || !d.shared ? Lock : d.scope === "project" ? Users : Globe
  return <Icon className="size-3.5" aria-hidden />
}

/** One dashboard: its name, who sees it, and its widgets, laid out. */
function DashboardView({ id, compact, onGone }: { id: string; compact: boolean; /** After a delete, and after its Undo (which opens it again). */ onGone: (open?: string) => void }) {
  const one = useDashboard(id)
  const { dashboard, widgets, canKeep } = one
  const offer = useUndoToast()
  const [dialog, setDialog] = useState<"rename" | "add" | Widget | null>(null)
  const now = useMemo(() => Date.now(), [])
  const list = useMemo(() => ordered(widgets), [widgets])
  // Drawn from their order and widths, so nothing overlaps whatever was kept.
  const placed = useMemo(() => {
    const at = new Map(flowPlaces(list).map((p) => [p.id, p]))
    return list.map((w) => ({ ...w, ...at.get(w.id)! }))
  }, [list])
  const results = useMemo(() => new Map((one.results ?? []).map((r) => [r.id, r])), [one.results])

  const keep = useCallback(
    async (next: ReturnType<typeof flowPlaces>) => {
      if (!samePlaces(list, next)) await one.arrange(next)
    },
    [list, one],
  )

  if (one.isError && !dashboard) {
    return (
      <WorkState>
        <ErrorState subject="this dashboard" onRetry={() => void one.refresh()} />
      </WorkState>
    )
  }
  if (!dashboard) {
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-4 lg:p-6" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    )
  }

  const removeWidget = async (w: Widget) => {
    await one.removeWidget(w.id)
    await keep(flowPlaces(list.filter((x) => x.id !== w.id)))
    offer("Widget removed", async () => {
      await one.restoreWidget(w.id)
    })
  }
  const deleteDashboard = async () => {
    await one.remove()
    onGone()
    offer(`"${dashboard.name}" deleted`, async () => {
      await one.restore()
      onGone(dashboard.id)
    })
  }
  const saveWidget = async (w: Pick<Widget, "kind" | "title" | "query" | "w" | "h">) => {
    if (dialog && typeof dialog === "object") {
      const next = list.map((x) => (x.id === dialog.id ? { ...x, w: w.w, h: w.h } : x))
      const at = flowPlaces(next).find((p) => p.id === dialog.id)!
      await one.changeWidget({ ...dialog, ...w, ...at })
      await keep(flowPlaces(next))
      return
    }
    const at = flowPlaces([...list, { id: "", w: w.w, h: w.h }]).at(-1)!
    await one.addWidget({ ...w, x: at.x, y: at.y })
  }

  const full = widgets.length >= MAX_WIDGETS
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 lg:px-6" data-dashboard={dashboard.id}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="truncate text-title-3 font-[590]">{dashboard.name}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2" data-dashboard-scope={dashboard.scope}>
            <ScopeIcon d={dashboard} />
            {scopeWords(dashboard)}
          </p>
        </div>
        {canKeep && (
          // A touch group (app/phone.css F3b): on a phone Rename and Delete are icon-sm, and their 44px reaches never overlap.
          <div className="flex items-center gap-1.5" data-touch-group="">
            <Button variant="ghost" size={compact ? "icon-sm" : "sm"} onClick={() => setDialog("rename")} aria-label="Rename and share">
              <Pencil />
              {!compact && "Rename"}
            </Button>
            <Button variant="ghost" size={compact ? "icon-sm" : "sm"} onClick={() => void deleteDashboard()} aria-label="Delete dashboard">
              <Trash2 />
              {!compact && "Delete"}
            </Button>
            <Button size="sm" onClick={() => setDialog("add")} disabled={full} title={full ? `A dashboard holds ${MAX_WIDGETS} widgets` : undefined}>
              <Plus className="!size-3.5" />
              Add widget
            </Button>
          </div>
        )}
      </div>
      {widgets.length === 0 ? (
        <EmptyState
          illustration={<SpotWelcome hue={areaHue("projects")} />}
          title="Nothing on this dashboard yet"
          description={canKeep ? "Add a widget: a number, a chart, a breakdown or a goal." : "Its keepers haven't added a widget yet."}
          action={canKeep ? <Button onClick={() => setDialog("add")}>Add widget</Button> : undefined}
        />
      ) : (
        <div
          data-dashboard-grid=""
          className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-12")}
          style={compact ? undefined : { gridAutoRows: "4.5rem" }}
          aria-busy={one.resultsLoading || undefined}
        >
          {placed.map((w, i) => (
            <DashboardWidget
              key={w.id}
              widget={w}
              result={results.get(w.id)}
              loading={one.resultsLoading}
              compact={compact}
              now={now}
              actions={
                canKeep
                  ? {
                      first: i === 0,
                      last: i === placed.length - 1,
                      onEdit: () => setDialog(w),
                      onMove: (by) => void keep(moved(list, i, i + by)),
                      onRemove: () => void removeWidget(w),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {dialog === "rename" && (
        <DashboardDialog editing={dashboard} places={[{ scope: dashboard.scope, label: "" }]} onSave={(input) => one.change(input)} onClose={() => setDialog(null)} />
      )}
      {(dialog === "add" || (dialog && typeof dialog === "object")) && (
        <WidgetDialog editing={typeof dialog === "object" ? dialog : undefined} inProject={dashboard.scope === "project"} onSave={saveWidget} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

export function DashboardsPage() {
  const params = useSearchParams()
  const router = useRouter()
  const { isDesktop } = useMedia()
  const project = params.get("project") ?? ""
  const asked = params.get("d") ?? ""
  const { lists, isLoading, isError, refresh, create } = useDashboardLists(project || undefined)
  const { projects } = useProjectsOverview()
  const [making, setMaking] = useState(false)
  const projectName = projects?.find((p) => p.project_uuid === project)?.project_name ?? "This project"
  const all = useMemo(() => (lists ? (project ? lists.project : [...lists.mine, ...lists.workspace]) : []), [lists, project])
  const open = asked || all[0]?.id || ""

  const go = useCallback((id: string, inProject = project) => router.replace(dashboardHref(id, inProject), { scroll: false }), [router, project])
  // A dashboard named in the address that isn't in the list read (deleted, or no longer shared) gives way to the first one.
  useEffect(() => {
    if (lists && asked && !all.some((d) => d.id === asked)) go("")
  }, [lists, asked, all, go])

  const places: { scope: DashboardScope; label: string }[] = project
    ? lists?.canMake
      ? [{ scope: "project", label: projectName }]
      : []
    : [{ scope: "mine", label: "Just me" }, ...(lists?.canMake ? [{ scope: "workspace" as const, label: "The workspace" }] : [])]

  const picker = (
    <Select value={open} onValueChange={(id) => go(id)} disabled={all.length === 0}>
      <SelectTrigger dense className="h-8 w-auto min-w-40 max-w-64 gap-1.5 text-sm" aria-label="Dashboard">
        <SelectValue placeholder="No dashboards" />
      </SelectTrigger>
      <SelectContent>
        {project ? (
          <SelectGroup>
            <SelectLabel>{projectName}</SelectLabel>
            {lists?.project.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : (
          (
            [
              ["Yours", lists?.mine ?? []],
              ["The workspace's", lists?.workspace ?? []],
            ] as const
          ).map(([label, ds]) =>
            ds.length ? (
              <SelectGroup key={label}>
                <SelectLabel>{label}</SelectLabel>
                {ds.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null,
          )
        )}
      </SelectContent>
    </Select>
  )

  const where = (
    <Select value={project || MINE} onValueChange={(v) => router.replace(dashboardHref("", v === MINE ? "" : v), { scroll: false })}>
      <SelectTrigger dense className="h-8 w-auto max-w-56 gap-1.5 text-sm" aria-label="Whose dashboards">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={MINE}>Yours and the workspace&apos;s</SelectItem>
        {(projects ?? []).map((p) => (
          <SelectItem key={p.project_uuid} value={p.project_uuid}>
            {p.project_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  let body: React.ReactNode
  if (isError && !lists) {
    body = (
      <WorkState>
        <ErrorState subject="dashboards" onRetry={() => void refresh()} />
      </WorkState>
    )
  } else if (isLoading && !lists) {
    body = (
      <div className="grid gap-4 p-4 lg:grid-cols-4 lg:p-6" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    )
  } else if (!open) {
    body = (
      <WorkState>
        <EmptyState
          illustration={<SpotWelcome hue={areaHue("projects")} />}
          title={project ? `No dashboards in ${projectName} yet` : "No dashboards yet"}
          description="A dashboard keeps the numbers and charts you check, worked out fresh for each reader."
          action={places.length ? <Button onClick={() => setMaking(true)}>New dashboard</Button> : undefined}
        />
      </WorkState>
    )
  } else {
    body = <DashboardView key={open} id={open} compact={!isDesktop} onGone={(again) => void refresh().then(() => go(again ?? ""))} />
  }

  const tabs = <WorkTabs tabs={VIEWS} value="dashboards" onChange={(v) => v !== "dashboards" && router.push(`/app/project?view=${v}`)} label="Projects views" className={isDesktop ? "mt-4 px-3.5" : "min-w-0 flex-1 border-b-0"} />
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {isDesktop ? (
        <>
          <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-7">
            <h1 className="text-title-1 font-[590] text-foreground">Projects</h1>
          </header>
          {tabs}
        </>
      ) : (
        <>
          <h1 className="sr-only">Dashboards</h1>
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-4">{tabs}</div>
        </>
      )}
      <div className={workToolbar}>
        <LayoutDashboard className="size-4 text-ink-3" aria-hidden />
        {where}
        {picker}
        <span className="flex-1" />
        {places.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setMaking(true)}>
            <Plus className="!size-3.5" />
            New dashboard
          </Button>
        )}
      </div>
      {body}
      {making && (
        <DashboardDialog
          places={places}
          onSave={async (input) => {
            const made = await create(input)
            go(made.id)
          }}
          onClose={() => setMaking(false)}
        />
      )}
    </div>
  )
}
