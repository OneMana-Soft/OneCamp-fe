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
import { Plus, Trash2, Pencil, Plug, Check, ExternalLink } from "@/lib/icons"
import {
  McpServer,
  McpCatalogEntry,
  parseMcpTools,
  setMcpServerEnabled,
  deleteMcpServer,
} from "@/services/mcpService"
import { McpServerEditDialog } from "./McpServerEditDialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { McpToolRiskBadge, McpToolRiskLegend } from "./McpToolRisk"

const McpServersCard = () => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: McpServer[] }>(GetEndpointUrl.GetMcpServers)
  const { data: catalogData, mutate: mutateCatalog } = useFetch<{ data: McpCatalogEntry[] }>(
    GetEndpointUrl.GetMcpCatalog,
  )
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<McpServer | null>(null)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<McpCatalogEntry | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const servers = data?.data || []
  const catalog = catalogData?.data || []

  const handleToggle = async (s: McpServer, next: boolean) => {
    setBusyId(s.id)
    try {
      await setMcpServerEnabled(s.id, next)
      toast({ title: next ? "Server enabled" : "Server disabled" })
      mutate()
    } catch {
      // interceptor surfaces the error
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (s: McpServer) => {
    confirm({
      title: "Remove MCP server",
      description: `Remove MCP server "${s.name}"? Its tools will no longer be available to agents.`,
      confirmText: "Remove",
      onConfirm: async () => {
        setBusyId(s.id)
        try {
          await deleteMcpServer(s.id)
          toast({ title: "Server removed" })
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
            <Plug className="h-5 w-5 text-primary" />
            MCP servers
          </CardTitle>
          <CardDescription className="max-w-xl">
            Connect external Model Context Protocol servers to extend your agents with new tools,
            from GitHub to your own internal services.
          </CardDescription>
        </div>
        <Button
          onClick={() => {
            setPrefill(null)
            setCreating(true)
          }}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add server
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div role="status" aria-label="Loading MCP servers">
            <SkeletonRows rows={3} />
          </div>
        ) : isError ? (
          <ErrorState subject="the MCP servers" onRetry={() => void mutate()} />
        ) : servers.length === 0 ? (
          <EmptyState
            tone="accent"
            icon={Plug}
            title="No MCP servers connected"
            description="Add a server to bring its tools into your agents."
            action={
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add your first server
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {/* Read once for the whole list: every tool chip below is labelled
                with the risk OneCamp enforces for it. */}
            <McpToolRiskLegend />
            {servers.map((s) => {
              const tools = parseMcpTools(s)
              return (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4 transition-colors hover:border-border"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{s.name}</span>
                      {!s.enabled && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                      {s.last_error ? (
                        <Badge variant="destructive" className="text-[10px]">Connection error</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">{tools.length} tool{tools.length === 1 ? "" : "s"}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{s.url}</p>
                    {tools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {tools.slice(0, 6).map((t) => (
                          <Badge key={t.name} variant="outline" className="gap-1 text-[11px] font-normal">
                            {t.name}
                            <McpToolRiskBadge tool={t} compact />
                          </Badge>
                        ))}
                        {tools.length > 6 && <span className="text-[11px] text-muted-foreground">+{tools.length - 6} more</span>}
                      </div>
                    )}
                    {s.last_error && <p className="text-[11px] text-destructive">{s.last_error}</p>}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={s.enabled}
                      disabled={busyId === s.id}
                      onCheckedChange={(v) => handleToggle(s, v)}
                      aria-label="Toggle server"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(s)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={busyId === s.id}
                      onClick={() => handleDelete(s)}
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Connector catalog — vetted MCP servers an admin can install in a
            couple of clicks (prefills the add-server dialog). Self-hosted and
            vendor-neutral: each points at a server the operator runs. */}
        {catalog.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="space-y-0.5">
              <h4 className="text-sm font-semibold">Connector catalog</h4>
              <p className="text-xs text-muted-foreground">
                Vetted connectors. Install one to prefill the setup, then paste your deployed
                server&apos;s URL and token.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.map((c) => (
                <div
                  key={c.slug}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:border-border"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <Badge variant="outline" className="text-[10px] font-normal">{c.category}</Badge>
                    </div>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{c.description}</p>
                    <a
                      href={c.docs_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Setup guide <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {c.installed ? (
                    <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                      <Check className="h-3 w-3" /> Installed
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setPrefill(c)
                        setCreating(true)
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Install
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {(creating || editing) && (
        <McpServerEditDialog
          server={editing}
          prefill={prefill}
          open={creating || !!editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            setPrefill(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            setPrefill(null)
            mutate()
            mutateCatalog()
          }}
        />
      )}
    </Card>
  )
}

export default McpServersCard
