"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"

const ENGINE_LABELS: Record<string, string> = { postgres: "PostgreSQL", mysql: "MySQL" }

/** A state is a dot and a word, not a filled badge. */
function StateWord({ tone, children }: { tone: "off" | "warn"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", tone === "warn" ? "text-warning-ink" : "text-muted-foreground")}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone === "warn" ? "bg-warning" : "bg-faint-foreground")} />
      {children}
    </span>
  )
}

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

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          {/* On the AI and automation group's tile; it was orange, which is
              for the one action a view asks for. */}
          <CardTitle as="h2" className="flex items-center gap-2.5 text-base font-semibold">
            <Tile hue={ADMIN_GROUP_HUE.ai} size="md">
              <Database />
            </Tile>
            Data sources
          </CardTitle>
          <CardDescription className="max-w-xl">
            Connect an outside database so agents can answer questions from it, the way they query tables here.
            Connections are read-only, and the password is stored encrypted.
          </CardDescription>
        </div>
        {/* Outline: the page's one primary action is New agent. */}
        <Button variant="outline" onClick={() => setCreating(true)} className="shrink-0 self-start">
          <Plus className="h-4 w-4 mr-1.5" />
          Add source
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div role="status" aria-label="Loading data sources">
            <SkeletonRows rows={3} />
          </div>
        ) : isError ? (
          <ErrorState subject="the data sources" onRetry={() => void mutate()} />
        ) : sources.length === 0 ? (
          <EmptyState
            tone="accent"
            icon={Database}
            hue={ADMIN_GROUP_HUE.ai}
            title="No data sources yet"
            description="Add a read-only PostgreSQL or MySQL connection to let agents query it."
          />
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
                      {!s.enabled && <StateWord tone="off">Turned off</StateWord>}
                      {!s.has_password && <StateWord tone="warn">No password</StateWord>}
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
      </CardContent>

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
    </Card>
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
