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
import { Plus, Trash2, Pencil, Plug, Loader2 } from "@/lib/icons"
import { McpServer, parseMcpTools, setMcpServerEnabled, deleteMcpServer } from "@/services/mcpService"
import { McpServerEditDialog } from "./McpServerEditDialog"

const McpServersCard = () => {
  const { data, isLoading, mutate } = useFetch<{ data: McpServer[] }>(GetEndpointUrl.GetMcpServers)
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<McpServer | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const servers = data?.data || []

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
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Add server
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Plug className="h-6 w-6 text-primary" />
            </div>
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">No MCP servers connected</p>
              <p className="text-sm text-muted-foreground">
                Add a server to bring its tools into your agents.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add your first server
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
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
                          <Badge key={t.name} variant="outline" className="text-[11px] font-normal">{t.name}</Badge>
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
      </CardContent>

      {(creating || editing) && (
        <McpServerEditDialog
          server={editing}
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

export default McpServersCard
