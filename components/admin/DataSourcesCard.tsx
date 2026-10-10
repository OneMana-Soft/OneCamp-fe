"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { StatusWord } from "@/components/ui/statusWord"
import { Switch } from "@/components/ui/switch"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Pencil, Database, Loader2, Play, ChevronRight, ChevronDown, Lock } from "@/lib/icons"
import {
  DataSource,
  DataSourceTable,
  deleteDataSource,
  setDataSourceEnabled,
  testDataSource,
  getDataSourceSchema,
} from "@/services/dataSourceService"
import { DataSourceEditDialog } from "./DataSourceEditDialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { SpotPlug } from "@/components/ui/graphics"
import { apiErrorMessage } from "@/lib/utils/apiError"

const ENGINE_LABELS: Record<string, string> = { postgres: "PostgreSQL", mysql: "MySQL" }


const DataSourcesCard = () => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: DataSource[] }>(GetEndpointUrl.GetDataSources)
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<DataSource | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sources = data?.data || []

  const handleToggle = async (s: DataSource, next: boolean) => {
    setBusyId(s.id)
    try {
      await setDataSourceEnabled(s.id, next)
      toast({ title: next ? `${s.name} is on` : `${s.name} is off` })
      mutate()
    } catch {
      // interceptor surfaces the error
    } finally {
      setBusyId(null)
    }
  }

  const handleTest = async (s: DataSource) => {
    setTestingId(s.id)
    try {
      const res = await testDataSource(s.id)
      toast({
        title: res.ok ? `${s.name} connected` : `Couldn't connect to ${s.name}`,
        description: res.ok ? undefined : res.message,
        variant: res.ok ? undefined : "destructive",
      })
    } catch (e) {
      // It had no catch: a test that threw left nothing on screen.
      toast({
        title: `Couldn't connect to ${s.name}`,
        description: apiErrorMessage(e, "Check its address and password, then test again."),
        variant: "destructive",
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleDelete = async (s: DataSource) => {
    confirm({
      title: `Remove the data source "${s.name}"?`,
      description: "Agents can no longer query it. You can add it again later.",
      confirmText: "Remove data source",
      destructive: true,
      onConfirm: async () => {
        setBusyId(s.id)
        try {
          await deleteDataSource(s.id)
          toast({ title: `${s.name} removed` })
          mutate()
        } catch {
          // interceptor surfaces the error
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  // A flat section of the settings Agents page, where it was a bordered Card
  // with its own tile and title.
  return (
    <SettingsSection
      title="Data sources"
      description="Connect an outside database so agents can answer questions from it, the way they query tables here. Connections are read-only, and the password is stored encrypted."
      action={
        // Outline: the page's one primary action is New agent.
        <Button variant="outline" size="sm" className={sectionActionClass} onClick={() => setCreating(true)}>
          <Plus />
          Add source
        </Button>
      }
    >
        {isLoading ? (
          <SectionListSkeleton label="Loading data sources" rows={1} lines={2} trailing="switch" />
        ) : isError ? (
          <ErrorState
            compact
            subject="the data sources"
            detail={apiErrorMessage(isError, "Try again in a moment.")}
            onRetry={() => void mutate()}
          />
        ) : sources.length === 0 ? (
          // A first run, so the plug spot, inside the list's own box.
          <div className="rounded-lg border border-border">
            <EmptyState
              icon={Database}
              hue={ADMIN_GROUP_HUE.ai}
              illustration={<SpotPlug hue={ADMIN_GROUP_HUE.ai} />}
              title="No data sources yet"
              description="Add a read-only PostgreSQL or MySQL connection to let agents query it."
              className="py-6"
            />
          </div>
        ) : (
          // One hairline list of rows, where each source was a card.
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sources.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate text-sm font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{ENGINE_LABELS[s.engine] ?? s.engine}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {s.visibility === "private" && <Lock className="h-3 w-3" aria-hidden="true" />}
                        {s.visibility === "private" ? "Only you and admins" : "Everyone here"}
                      </span>
                      {!s.enabled && <StatusWord className="text-xs">Turned off</StatusWord>}
                      {!s.has_password && <StatusWord tone="warning" className="text-xs">No password</StatusWord>}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {s.username ? `${s.username}@` : ""}{s.host}:{s.port}/{s.database} · sslmode={s.ssl_mode}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={s.enabled}
                      disabled={busyId === s.id || !s.can_manage}
                      onCheckedChange={(v) => handleToggle(s, v)}
                      aria-label={`Use ${s.name}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Test ${s.name}`}
                      className="h-8 w-8"
                      disabled={testingId === s.id || !s.can_manage}
                      onClick={() => handleTest(s)}
                      title="Test connection"
                    >
                      {testingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${s.name}`}
                      className="h-8 w-8"
                      disabled={!s.can_manage}
                      onClick={() => setEditing(s)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${s.name}`}
                      className="h-8 w-8 text-danger-ink hover:text-danger-ink"
                      disabled={busyId === s.id || !s.can_manage}
                      onClick={() => handleDelete(s)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  aria-expanded={expandedId === s.id}
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                  {expandedId === s.id ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                  What agents can see
                </button>
                {expandedId === s.id && <SchemaBrowser id={s.id} />}
              </li>
            ))}
          </ul>
        )}

      {(creating || editing) && (
        <DataSourceEditDialog
          source={editing}
          open={creating || !!editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            mutate()
          }}
        />
      )}
    </SettingsSection>
  )
}

// SchemaBrowser lazily introspects a source's tables/columns when expanded, so
// the admin can confirm what an agent will see before granting access.
const SchemaBrowser = ({ id }: { id: string }) => {
  const [tables, setTables] = useState<DataSourceTable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getDataSourceSchema(id)
      .then((t) => {
        if (!cancelled) setTables(t)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(`Couldn't read its tables. ${apiErrorMessage(e, "Test the connection, then try again.")}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div role="status" aria-label="Reading its tables" className="mt-2">
        <SkeletonRows rows={2} avatar={false} />
      </div>
    )
  }
  if (error) {
    return <p role="alert" className="mt-2 text-xs text-danger-ink">{error}</p>
  }
  if (!tables || tables.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">Agents can see no tables in it.</p>
  }
  return (
    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2">
      {tables.map((t) => (
        <div key={`${t.schema}.${t.name}`} className="space-y-1">
          <p className="font-mono text-2xs font-semibold text-foreground">
            {t.schema}.{t.name}
          </p>
          <div className="flex flex-wrap gap-1">
            {t.columns.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-2xs text-muted-foreground"
                title={c.native_type}
              >
                {c.name}
                <span className="text-faint-foreground">{c.data_type}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default DataSourcesCard
