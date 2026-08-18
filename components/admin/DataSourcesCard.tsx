"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Pencil, Database, Loader2, Play, AlertTriangle, ChevronRight, ChevronDown, Lock } from "@/lib/icons"
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
      toast({ title: next ? "Data source enabled" : "Data source disabled" })
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
        title: res.ok ? "Connection ok" : "Connection failed",
        description: res.ok ? undefined : res.message,
        variant: res.ok ? undefined : "destructive",
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleDelete = async (s: DataSource) => {
    confirm({
      title: "Remove data source",
      description: `Remove "${s.name}"? Agents will no longer be able to query it.`,
      confirmText: "Remove",
      onConfirm: async () => {
        setBusyId(s.id)
        try {
          await deleteDataSource(s.id)
          toast({ title: "Data source removed" })
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
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-primary" />
            Data sources
          </CardTitle>
          <CardDescription className="max-w-xl">
            Connect a read-only external database so agents can answer questions from it — the same
            deterministic way they query native tables. Connections are opened read-only and the
            password is encrypted at rest.
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
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
            title="No data sources connected"
            description="Add a read-only PostgreSQL or MySQL connection to let agents query it."
            action={
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add your first source
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {sources.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-border/60 p-4 transition-colors hover:border-border"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{s.name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{s.engine}</Badge>
                      <Badge
                        variant={s.visibility === "workspace" ? "secondary" : "outline"}
                        className="gap-1 text-[10px]"
                      >
                        {s.visibility === "private" && <Lock className="h-2.5 w-2.5" />}
                        {s.visibility}
                      </Badge>
                      {!s.enabled && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                      {!s.has_password && (
                        <Badge variant="outline" className="gap-1 text-[10px] text-warning">
                          <AlertTriangle className="h-2.5 w-2.5" /> no password
                        </Badge>
                      )}
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
                      aria-label="Toggle data source"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
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
                      className="h-8 w-8 text-destructive hover:text-destructive"
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
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {expandedId === s.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Browse schema
                </button>
                {expandedId === s.id && <SchemaBrowser id={s.id} />}
              </div>
            ))}
          </div>
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
        if (!cancelled) {
          const msg =
            (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg ||
            "Could not read the schema."
          setError(msg)
        }
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
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading schema…
      </div>
    )
  }
  if (error) {
    return <p className="mt-2 text-xs text-destructive">{error}</p>
  }
  if (!tables || tables.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">No tables exposed.</p>
  }
  return (
    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-2">
      {tables.map((t) => (
        <div key={`${t.schema}.${t.name}`} className="space-y-1">
          <p className="font-mono text-[11px] font-semibold text-foreground">
            {t.schema}.{t.name}
          </p>
          <div className="flex flex-wrap gap-1">
            {t.columns.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                title={c.native_type}
              >
                {c.name}
                <span className="text-primary/70">{c.data_type}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default DataSourcesCard
