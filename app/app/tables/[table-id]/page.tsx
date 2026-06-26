"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, Globe, Lock, LayoutGrid, Kanban, CalendarDays, Sparkles } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useMqttTopic } from "@/hooks/useMqttTopic"
import { DataTableGrid } from "@/components/table/DataTableGrid"
import { DataTableBoard } from "@/components/table/DataTableBoard"
import { DataTableCalendar } from "@/components/table/DataTableCalendar"
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog"
import {
  TableBundle,
  updateTable,
  Visibility,
  ViewType,
  parseFieldConfig,
  parseViewConfig,
} from "@/services/tableService"

export default function TableDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tableId = String(params["table-id"] || "")

  const { data, isLoading, mutate } = useFetch<{ data: TableBundle }>(
    tableId ? `${GetEndpointUrl.GetTable}/${tableId}` : "",
  )
  const bundle = data?.data

  const [name, setName] = React.useState("")
  const [activeView, setActiveView] = React.useState<ViewType>("grid")
  const [publishing, setPublishing] = React.useState(false)
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
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!bundle?.table) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
        <p>This table doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/app/tables")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to tables
        </Button>
      </div>
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

  const VIEW_TABS: { type: ViewType; label: string; icon: typeof LayoutGrid }[] = [
    { type: "grid", label: "Grid", icon: LayoutGrid },
    { type: "board", label: "Board", icon: Kanban },
    { type: "calendar", label: "Calendar", icon: CalendarDays },
  ]

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/app/tables")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-2xl">{t.icon || "📊"}</span>
        {bundle.can_manage ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="flex-1 bg-transparent text-xl font-semibold outline-none focus:border-b focus:border-border"
            maxLength={120}
          />
        ) : (
          <h1 className="flex-1 text-xl font-semibold">{t.name}</h1>
        )}
        {bundle.can_manage && (
          <Button variant="outline" size="sm" onClick={toggleVisibility} className="gap-1.5">
            {t.visibility === "workspace" ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {t.visibility === "workspace" ? "Workspace" : "Private"}
          </Button>
        )}
        {bundle.can_manage && (
          <Button variant="outline" size="sm" onClick={() => setPublishing(true)} className="gap-1.5" title="Save as template">
            <Sparkles className="h-3.5 w-3.5" /> Publish
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center gap-1 border-b border-border/60">
        {VIEW_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.type}
              onClick={() => setActiveView(tab.type)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm transition-colors",
                activeView === tab.type
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {tab.label}
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-border/60">
        {activeView === "grid" && (
          <DataTableGrid
            tableId={tableId}
            fields={fields}
            rows={rows}
            canManage={bundle.can_manage}
            onChange={mutate}
          />
        )}
        {activeView === "board" && (
          <DataTableBoard
            tableId={tableId}
            fields={fields}
            rows={rows}
            canManage={bundle.can_manage}
            onChange={mutate}
          />
        )}
        {activeView === "calendar" && (
          <DataTableCalendar
            tableId={tableId}
            fields={fields}
            rows={rows}
            canManage={bundle.can_manage}
            onChange={mutate}
          />
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
    </div>
  )
}
