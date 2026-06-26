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
import { Plus, Trash2, Pencil, Sparkles, Loader2, Rocket } from "@/lib/icons"
import {
  Agent,
  parseEnabledTools,
  parseScope,
  parseTriggerConfig,
  toolLabel,
  setAgentActive,
  deleteAgent,
} from "@/services/agentService"
import { AgentEditDialog } from "./AgentEditDialog"
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog"

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  mention: "On mention",
  schedule: "Scheduled",
  event: "On event",
}

const AgentsCard = () => {
  const { data, isLoading, mutate } = useFetch<{ data: Agent[] }>(GetEndpointUrl.GetAgents)
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Agent | null>(null)
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<Agent | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const agents = data?.data || []

  const handleToggle = async (a: Agent, next: boolean) => {
    setBusyId(a.id)
    try {
      await setAgentActive(a.id, next)
      toast({ title: next ? "Agent enabled" : "Agent paused" })
      mutate()
    } catch {
      // interceptor surfaces the error
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (a: Agent) => {
    confirm({
      title: "Delete agent",
      description: `Delete agent "${a.name}"? This can't be undone.`,
      confirmText: "Delete",
      onConfirm: async () => {
        setBusyId(a.id)
        try {
          await deleteAgent(a.id)
          toast({ title: "Agent deleted" })
          mutate()
        } catch {
          // interceptor surfaces the error
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  // Build the portable template payload (the agent's create-input) the
  // templates gallery replays on install.
  const agentTemplatePayload = (a: Agent) => ({
    name: a.name,
    description: a.description || undefined,
    avatar_key: a.avatar_key || undefined,
    instructions: a.instructions,
    model_pref: a.model_pref || undefined,
    enabled_tools: parseEnabledTools(a),
    trigger_type: a.trigger_type,
    trigger_config: parseTriggerConfig(a),
    scope: parseScope(a),
    max_steps: a.max_steps,
    is_active: false,
  })

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Agents
          </CardTitle>
          <CardDescription className="max-w-xl">
            Build agents that do real work for you. Give one instructions and a few tools, and it
            acts in your workspace, only ever within your own permissions.
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          New agent
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">No agents yet</p>
              <p className="text-sm text-muted-foreground">
                Try: a standup agent that summarizes #standup each morning and opens a task for any
                blocker.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create your first agent
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((a) => {
              const tools = parseEnabledTools(a)
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4 transition-colors hover:border-border"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{a.name}</span>
                      <Badge variant="outline" className="text-[10px]">{TRIGGER_LABEL[a.trigger_type] || a.trigger_type}</Badge>
                      {!a.is_active && <Badge variant="secondary" className="text-[10px]">Paused</Badge>}
                      {a.last_error && <Badge variant="destructive" className="text-[10px]">Last run failed</Badge>}
                    </div>
                    {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tools.slice(0, 5).map((t) => (
                        <Badge key={t} variant="outline" className="text-[11px] font-normal">{toolLabel(t)}</Badge>
                      ))}
                      {tools.length > 5 && <span className="text-[11px] text-muted-foreground">+{tools.length - 5} more</span>}
                      <span className="text-[11px] text-muted-foreground">· ran {a.run_count} {a.run_count === 1 ? "time" : "times"}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={a.is_active}
                      disabled={busyId === a.id}
                      onCheckedChange={(v) => handleToggle(a, v)}
                      aria-label="Toggle agent"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(a)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPublishing(a)}
                      title="Save as template"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={busyId === a.id}
                      onClick={() => handleDelete(a)}
                      title="Delete"
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
        <AgentEditDialog
          agent={editing}
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

      {publishing && (
        <PublishTemplateDialog
          open={!!publishing}
          onOpenChange={(o) => !o && setPublishing(null)}
          kind="agent"
          payload={agentTemplatePayload(publishing)}
          defaultName={publishing.name}
        />
      )}
    </Card>
  )
}

export default AgentsCard
