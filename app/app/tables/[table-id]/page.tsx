"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Globe, Lock, LayoutGrid, Kanban, CalendarDays, BarChart3, LayoutTemplate, Share2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { DataTableGrid } from "@/components/table/DataTableGrid"
import { DataTableBoard } from "@/components/table/DataTableBoard"
import { DataTableCalendar } from "@/components/table/DataTableCalendar"
import { DataTableChart } from "@/components/table/DataTableChart"
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog"
import { nextRowPosition, TableBundle, updateTable, Visibility, ViewType, parseFieldConfig, parseViewConfig, tableBundleKey } from "@/services/tableService"
import { applyViewRules, fitRules, loadViewRules, NO_RULES, saveViewRules, type ViewRules } from "@/lib/tables/viewRules"
import { ViewRulesBar } from "@/components/table/ViewRulesBar"
import { TableGlyph } from "@/components/table/TableGlyph"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { SpotError, SpotImported, SpotSearch } from "@/components/ui/graphics"
import { hueFor } from "@/lib/campHue"
import { viewFromQuery, type ViewChoice } from "@/lib/tables/tableView"

export default function TableDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const tableId = String(params["table-id"] || "")

  const { data, isLoading, mutate } = useFetch<{ data: TableBundle }>(
    tableId ? tableBundleKey(tableId) : "",
    undefined,
    undefined,
    // A deleted/inaccessible table 404s/403s; show the friendly "doesn't exist"
    // state below instead of firing the global error toast.
    { suppressErrorToast: true } as never,
  )
  const bundle = data?.data

  const [name, setName] = React.useState("")
  // "chart" is a client-only analytics view (not a persisted server view type),
  // so it needs no migration and is always available on any table. The view
  // is in the address (?view=board), so a reload or a shared link opens the
  // same one; replaceState, not a navigation, so switching fetches nothing.
  const [activeView, setActiveView] = React.useState<ViewChoice>(() => viewFromQuery(searchParams.get("view")))
  const showView = React.useCallback((view: ViewChoice) => {
    setActiveView(view)
    const url = new URL(window.location.href)
    if (view === "grid") url.searchParams.delete("view")
    else url.searchParams.set("view", view)
    window.history.replaceState(window.history.state, "", url)
  }, [])
  const [publishing, setPublishing] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  React.useEffect(() => {
    if (bundle?.table) setName(bundle.table.name)
  }, [bundle?.table?.name])

  // Live collaboration: revalidate the bundle when another client changes a row
  // on this table. The topic is table-specific, so any message means refresh.
  // We debounce so a burst of edits triggers a single refetch.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMqtt = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => mutate(), 300)
  }, [mutate])
  useMqttTopic({ topic: bundle?.mqtt_topic || "", onMessage: onMqtt })
  React.useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  // A cheap signature of the row set (count + latest edit) so the Chart view
  // re-aggregates whenever rows are added, edited, or removed — including via
  // the MQTT live-refresh above. Best-effort for very large tables (the bundle
  // carries the first page). MUST stay above the early returns below so the
  // hook order is stable across the loading/loaded transitions (a hook after a
  // conditional return trips React's "rendered more hooks than last render").
  const chartDataVersion = React.useMemo(() => {
    const rs = bundle?.rows || []
    let latest = ""
    for (const r of rs) if (r.updated_at > latest) latest = r.updated_at
    return `${rs.length}:${latest}`
  }, [bundle?.rows])

  // Sort and filter: this reader's, for this table, kept in their browser.
  // Read once the fields are known, so rules on fields deleted since are
  // dropped. Above the early returns, with the other hooks.
  const [rules, setRules] = React.useState<ViewRules>(NO_RULES)
  const fieldsKnown = !!bundle?.fields
  React.useEffect(() => {
    if (fieldsKnown && bundle?.fields) setRules(loadViewRules(tableId, bundle.fields))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per table, when its fields arrive
  }, [tableId, fieldsKnown])
  const changeRules = React.useCallback(
    (next: ViewRules) => {
      setRules(next)
      saveViewRules(tableId, next)
    },
    [tableId],
  )
  // A field deleted or retyped since takes its rules with it.
  React.useEffect(() => {
    if (!bundle?.fields) return
    setRules((r) => fitRules(r, bundle.fields))
  }, [bundle?.fields])
  const shownRows = React.useMemo(
    () => applyViewRules(bundle?.rows || [], bundle?.fields || [], rules),
    [bundle?.rows, bundle?.fields, rules],
  )
  // Once per row set, not once per view on every render.
  const nextPosition = React.useMemo(() => nextRowPosition(bundle?.rows || []), [bundle?.rows])
  const clearFilters = React.useCallback(() => changeRules({ ...rules, filters: [] }), [changeRules, rules])

  const commitName = async () => {
    if (!bundle?.table || !bundle.can_manage) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === bundle.table.name) {
      setName(bundle.table.name)
      return
    }
    try {
      await updateTable(tableId, {
        name: trimmed,
        description: bundle.table.description || undefined,
        icon: bundle.table.icon || undefined,
        visibility: bundle.table.visibility,
      })
      mutate()
    } catch {
      setName(bundle.table.name)
    }
  }

  const toggleVisibility = async () => {
    if (!bundle?.table || !bundle.can_manage) return
    const next: Visibility = bundle.table.visibility === "workspace" ? "private" : "workspace"
    try {
      await updateTable(tableId, {
        name: bundle.table.name,
        description: bundle.table.description || undefined,
        icon: bundle.table.icon || undefined,
        visibility: next,
      })
      mutate()
    } catch {
      // surfaced by interceptor
    }
  }

  if (isLoading) {
    return <TablePageSkeleton />
  }

  if (!bundle?.table) {
    return (
      <EmptyState
        illustration={<SpotError />}
        title="This table isn't available"
        description="It doesn't exist, or you don't have access to it."
        headingLevel={2}
        className="py-20"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/app/tables">Back to tables</Link>
          </Button>
        }
      />
    )
  }

  const t = bundle.table
  const fields = bundle.fields || []
  const rows = bundle.rows || []

  // Stable payload the templates gallery replays on install (table structure
  // only, never row data).
  const templatePayload = {
    table: {
      name: t.name,
      description: t.description || undefined,
      icon: t.icon || undefined,
      visibility: t.visibility,
    },
    fields: fields
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((f) => ({ name: f.name, type: f.type, config: parseFieldConfig(f), position: f.position })),
    views: (bundle.views || []).map((v) => ({
      name: v.name,
      type: v.type,
      config: parseViewConfig(v),
      position: v.position,
    })),
  }

  const VIEW_TABS: { type: ViewType | "chart"; label: string; icon: typeof LayoutGrid }[] = [
    { type: "grid", label: "Grid", icon: LayoutGrid },
    { type: "board", label: "Board", icon: Kanban },
    { type: "calendar", label: "Calendar", icon: CalendarDays },
    { type: "chart", label: "Chart", icon: BarChart3 },
  ]

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      {/* The title row wraps on a phone: the name keeps the first line and the
          table's actions drop below it, icon-only, instead of running off the
          right edge. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
            <Link href="/app/tables" aria-label="Back to tables">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <TableGlyph size="lg" icon={t.icon} id={t.id} />
          {bundle.can_manage ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              aria-label="Table name"
              className="min-w-0 flex-1 truncate border-b border-transparent bg-transparent font-display text-2xl font-semibold outline-none focus:border-border"
              maxLength={120}
            />
          ) : (
            <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{t.name}</h1>
          )}
        </div>
        {bundle.can_manage && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={toggleVisibility} className="gap-1.5 text-muted-foreground" aria-label={t.visibility === "workspace" ? "Visible to the workspace" : "Private to you"}>
              {t.visibility === "workspace" ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t.visibility === "workspace" ? "Workspace" : "Private"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPublishing(true)} className="gap-1.5 text-muted-foreground" aria-label="Save as template" title="Save as template">
              <LayoutTemplate className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Publish</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSharing(true)} className="gap-1.5" aria-label="Share" title="Share externally">
              <Share2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Share</span>
            </Button>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center gap-1 overflow-x-auto border-b border-border/60" role="group" aria-label="View">
        {VIEW_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.type}
              type="button"
              onClick={() => showView(tab.type)}
              aria-pressed={activeView === tab.type}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                activeView === tab.type
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {tab.label}
            </button>
          )
        })}
      </div>

      <div className="rounded-lg border border-border/60">
        {activeView !== "chart" && (
          <ViewRulesBar
            fields={[...fields].sort((a, b) => a.position - b.position)}
            rules={rules}
            onChange={changeRules}
            shown={shownRows.length}
            total={rows.length}
            truncated={!!bundle.rows_truncated}
          />
        )}
        {activeView === "grid" && (
          <DataTableGrid
            tableId={tableId}
            fields={fields}
            rows={shownRows}
            nextPosition={nextPosition}
            canManage={bundle.can_manage}
            onChange={mutate}
            empty={
              rows.length === 0 ? (
                // In the table's own hue, the one its icon wears.
                <EmptyState
                  illustration={<SpotImported hue={hueFor(tableId)} />}
                  title="No rows yet"
                  description="Each row is one record: a lead, an order, a task. Add the first one below."
                  className="py-10"
                />
              ) : (
                <EmptyState
                  illustration={<SpotSearch />}
                  title="No rows match these filters"
                  className="py-10"
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              )
            }
          />
        )}
        {activeView === "board" && (
          <DataTableBoard
            tableId={tableId}
            fields={fields}
            rows={shownRows}
            nextPosition={nextPosition}
            canManage={bundle.can_manage}
            onChange={mutate}
          />
        )}
        {activeView === "calendar" && (
          <DataTableCalendar
            tableId={tableId}
            fields={fields}
            rows={shownRows}
            nextPosition={nextPosition}
            canManage={bundle.can_manage}
            onChange={mutate}
          />
        )}
        {activeView === "chart" && (
          <DataTableChart tableId={tableId} fields={fields} dataVersion={chartDataVersion} />
        )}
      </div>

      <PublishTemplateDialog
        open={publishing}
        onOpenChange={setPublishing}
        kind="table"
        payload={templatePayload}
        defaultName={t.name}
        defaultIcon={t.icon || undefined}
      />

      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Share table</DialogTitle>
            <DialogDescription>
              Give people outside your workspace a read-only link to this table.
            </DialogDescription>
          </DialogHeader>
          <GuestLinkSection resourceType="table" resourceId={tableId} canShare={bundle.can_manage} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * The table page's shape while it loads: its title row, its views, the rules
 * bar and a grid of rows the height the real ones are, so nothing moves when
 * the table arrives. It was a spinner in an empty page.
 */
function TablePageSkeleton() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6" role="status" aria-label="Loading table">
      <div className="mb-4 flex items-center gap-2" aria-hidden="true">
        <div className="h-8 w-8 shrink-0" />
        <Skeleton className="h-8 w-8 shrink-0 rounded-[10px]" />
        <Skeleton className="h-6 w-56 rounded" />
      </div>
      <div className="mb-3 flex items-center gap-4 border-b border-border/60 px-3 pb-2.5 pt-1.5" aria-hidden="true">
        <Skeleton className="h-4 w-12 rounded" />
        <Skeleton className="h-4 w-14 rounded" />
        <Skeleton className="h-4 w-20 rounded" />
        <Skeleton className="h-4 w-14 rounded" />
      </div>
      <div className="rounded-lg border border-border/60" aria-hidden="true">
        <div className="flex h-10 items-center gap-2 border-b border-border/60 px-2">
          <Skeleton className="h-4 w-14 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex h-[37px] items-center gap-6 border-b border-border/40 px-3 last:border-b-0">
            <Skeleton className={cn("h-3 rounded", i % 3 === 0 ? "w-40" : i % 3 === 1 ? "w-32" : "w-48")} />
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="hidden h-3 w-24 rounded sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
