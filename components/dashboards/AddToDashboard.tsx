"use client"

// Add to dashboard (B9-b4, asana-08): what Reports shows, or a saved view,
// put on a dashboard the reader keeps, from where they are. It is the widget
// editor (WidgetDialog) with the dashboards the reader keeps above it: theirs,
// the workspace's when they keep those, and the source's project's when they
// keep its. One who keeps none gets one of their own, made as they add.
// Loaded on demand (addToDashboardPiece), never on a page's first load.

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToastAction } from "@/components/ui/toast"
import { WidgetDialog, type WidgetFields } from "@/components/dashboards/WidgetDialog"
import { toast } from "@/hooks/use-toast"
import { addWidgetTo, useDashboardLists } from "@/hooks/useDashboards"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { dashboardHref, MAX_NAME, scopeWords, type Dashboard, type WidgetKind, type WidgetQuery } from "@/lib/dashboards"

export interface AddToDashboardProps {
  /** What the widget reads and, when it came from one, the chart it shows. */
  preset: { kind?: WidgetKind; query: WidgetQuery }
  /** The saved view it reads, by name. */
  viewName?: string
  /** The source's one project: that project's dashboards are offered too. */
  project?: string
  onClose: () => void
}

const OWN_NAME = "My dashboard"

export function AddToDashboard({ preset, viewName, project, onClose }: AddToDashboardProps) {
  const all = useDashboardLists()
  const inProject = useDashboardLists(project)
  const kept: Dashboard[] = [
    ...(all.lists?.mine ?? []),
    ...(all.lists?.canMake ? all.lists.workspace : []),
    ...(project && inProject.lists?.canMake ? inProject.lists.project : []),
  ]
  const [picked, setPicked] = useState("")
  const [name, setName] = useState(OWN_NAME)
  const target = kept.find((d) => d.id === picked) ?? kept[0]
  const loading = !all.lists && all.isLoading
  const failed = !all.lists && all.isError
  const none = !!all.lists && kept.length === 0

  const save = async (w: WidgetFields) => {
    const to = target ?? (await all.create({ name: name.trim() || OWN_NAME, scope: "mine", shared: false }))
    await addWidgetTo(to.id, w)
    toast({
      tone: "success",
      title: `Added to ${to.name}`,
      action: (
        <ToastAction asChild altText={`Open ${to.name}`}>
          <Link href={dashboardHref(to.id, to.scope === "project" ? to.project_id : undefined)} data-added-open="">
            Open
          </Link>
        </ToastAction>
      ),
    })
  }

  const head = (
    <div className="grid gap-1.5" data-add-to-dashboard="">
      <Label htmlFor="widget-dashboard">Dashboard</Label>
      {failed ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-sunken px-3 py-2" role="alert">
          <p className="text-sm text-ink-2">
            <SaysLoadFailure />
            Couldn&apos;t load your dashboards.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void all.refresh()}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <p className="py-2 text-sm text-ink-2" aria-busy="true">
          Loading your dashboards…
        </p>
      ) : none ? (
        <>
          <Input id="widget-dashboard" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} aria-describedby="widget-dashboard-new" />
          <p id="widget-dashboard-new" className="text-xs text-ink-2">
            You keep no dashboard yet. This makes one of your own, seen only by you.
          </p>
        </>
      ) : (
        <>
          <Select value={target?.id ?? ""} onValueChange={setPicked}>
            <SelectTrigger id="widget-dashboard" aria-label="Dashboard">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kept.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {target && <p className="text-xs text-ink-2">{scopeWords(target)}</p>}
        </>
      )}
    </div>
  )

  return (
    <WidgetDialog
      heading="Add to a dashboard"
      head={head}
      preset={preset}
      viewName={viewName}
      project={target?.scope === "project" ? target.project_id : undefined}
      others={!!target && target.scope !== "mine"}
      blocked={loading || failed}
      onSave={save}
      onClose={onClose}
    />
  )
}
