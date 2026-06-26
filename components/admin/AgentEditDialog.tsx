"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { McpServer, parseMcpTools, mcpToolFullName } from "@/services/mcpService"
import { cn } from "@/lib/utils/helpers/cn"
import { Loader2, Sparkles, Play, AlertTriangle, Check, X } from "@/lib/icons"
import {
  Agent,
  AgentInput,
  AgentTriggerType,
  TOOL_CATALOG,
  EVENT_TRIGGER_OPTIONS,
  SCHEDULE_PRESETS,
  createAgent,
  updateAgent,
  runAgent,
  parseEnabledTools,
  parseTriggerConfig,
  type AgentRunOutcome,
} from "@/services/agentService"

interface AgentEditDialogProps {
  agent: Agent | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const TRIGGERS: { value: AgentTriggerType; label: string; hint: string }[] = [
  { value: "manual", label: "Manual", hint: "Run it yourself from here." },
  { value: "mention", label: "On mention", hint: "Runs when someone @mentions the agent." },
  { value: "schedule", label: "On a schedule", hint: "Runs on a recurring schedule." },
  { value: "event", label: "On an event", hint: "Runs when a workspace event happens." },
]

export function AgentEditDialog({ agent, open, onClose, onSaved }: AgentEditDialogProps) {
  const { toast } = useToast()
  const editing = !!agent

  // Enabled MCP servers contribute extra tool groups (only fetched while open).
  const { data: mcpData } = useFetch<{ data: McpServer[] }>(open ? GetEndpointUrl.GetMcpServers : "")
  const mcpServers = React.useMemo(
    () => (mcpData?.data || []).filter((s) => s.enabled && parseMcpTools(s).length > 0),
    [mcpData],
  )

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [instructions, setInstructions] = React.useState("")
  const [tools, setTools] = React.useState<Set<string>>(new Set())
  const [triggerType, setTriggerType] = React.useState<AgentTriggerType>("manual")
  // Trigger configuration (per type).
  const [scheduleMinutes, setScheduleMinutes] = React.useState(60)
  const [eventType, setEventType] = React.useState(EVENT_TRIGGER_OPTIONS[0].value)
  const [mentionHandle, setMentionHandle] = React.useState("")
  const [maxSteps, setMaxSteps] = React.useState(8)
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Test panel
  const [testPrompt, setTestPrompt] = React.useState("")
  const [dryRun, setDryRun] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const [outcome, setOutcome] = React.useState<AgentRunOutcome | null>(null)

  React.useEffect(() => {
    if (!open) return
    if (agent) {
      setName(agent.name)
      setDescription(agent.description || "")
      setInstructions(agent.instructions || "")
      setTools(new Set(parseEnabledTools(agent)))
      setTriggerType(agent.trigger_type)
      const cfg = parseTriggerConfig(agent)
      setScheduleMinutes(cfg.interval_minutes && cfg.interval_minutes > 0 ? cfg.interval_minutes : 60)
      setEventType(cfg.event || EVENT_TRIGGER_OPTIONS[0].value)
      setMentionHandle(cfg.handle || "")
      setMaxSteps(agent.max_steps || 8)
      setIsActive(agent.is_active)
    } else {
      setName("")
      setDescription("")
      setInstructions("")
      setTools(new Set())
      setTriggerType("manual")
      setScheduleMinutes(60)
      setEventType(EVENT_TRIGGER_OPTIONS[0].value)
      setMentionHandle("")
      setMaxSteps(8)
      setIsActive(true)
    }
    setError(null)
    setOutcome(null)
    setTestPrompt("")
    setDryRun(true)
  }, [open, agent])

  const toggleTool = (t: string) => {
    setTools((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const buildInput = (): AgentInput => {
    let triggerConfig: Record<string, unknown> | undefined
    if (triggerType === "schedule") {
      triggerConfig = { interval_minutes: Math.max(1, scheduleMinutes || 60) }
    } else if (triggerType === "event") {
      triggerConfig = { event: eventType }
    } else if (triggerType === "mention" && mentionHandle.trim()) {
      triggerConfig = { handle: mentionHandle.trim() }
    }
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      instructions: instructions.trim(),
      enabled_tools: Array.from(tools),
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      max_steps: maxSteps,
      is_active: isActive,
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Give your agent a name.")
      return
    }
    if (!instructions.trim()) {
      setError("Add instructions so the agent knows what to do.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (editing && agent) await updateAgent(agent.id, buildInput())
      else await createAgent(buildInput())
      toast({ title: editing ? "Agent updated" : "Agent created" })
      onSaved()
    } catch {
      // axios interceptor surfaces the error toast
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!editing || !agent) {
      toast({ title: "Save the agent first", description: "Create the agent, then test it." })
      return
    }
    setRunning(true)
    setOutcome(null)
    try {
      const res = await runAgent(agent.id, testPrompt.trim(), dryRun)
      setOutcome(res)
    } catch {
      toast({ title: "Test run failed", variant: "destructive" })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {editing ? "Edit agent" : "New agent"}
          </DialogTitle>
          <DialogDescription>
            Give it instructions and the tools it may use. It acts as you, only within your permissions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standup summarizer" maxLength={120} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-desc">Description</Label>
            <Input id="agent-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent is for (optional)" maxLength={500} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-instr">Instructions</Label>
            <Textarea
              id="agent-instr"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Describe the agent's job, tone, and how it should use its tools. e.g. 'Each morning, summarize #standup and open a task for any blocker.'"
              className="min-h-[120px] resize-none"
              maxLength={8000}
            />
          </div>

          <div className="grid gap-2">
            <Label>Tools the agent can use</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Pick only what it needs. Tools marked with a warning take actions in the workspace.
            </p>
            <div className="space-y-3 rounded-xl border p-3">
              {TOOL_CATALOG.map((g) => (
                <div key={g.group}>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.tools.map((t) => {
                      const on = tools.has(t.name)
                      return (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => toggleTool(t.name)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                          {t.label}
                          {t.write && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {mcpServers.length > 0 && (
            <div className="grid gap-2">
              <Label>MCP tools</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Tools from connected MCP servers. These call external systems.
              </p>
              <div className="space-y-3 rounded-xl border p-3">
                {mcpServers.map((s) => (
                  <div key={s.id}>
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {parseMcpTools(s).map((t) => {
                        const full = mcpToolFullName(s, t)
                        const on = tools.has(full)
                        return (
                          <button
                            key={full}
                            type="button"
                            onClick={() => toggleTool(full)}
                            title={t.description || t.name}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                              on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {on ? <Check className="h-3 w-3" /> : null}
                            {t.name}
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Trigger</Label>
            <div className="flex flex-wrap gap-1.5">
              {TRIGGERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTriggerType(t.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    triggerType === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{TRIGGERS.find((t) => t.value === triggerType)?.hint}</p>

            {/* Per-trigger configuration */}
            {triggerType === "schedule" && (
              <div className="mt-1 grid gap-2 rounded-lg border bg-muted/30 p-3">
                <Label className="text-xs">How often should it run?</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SCHEDULE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setScheduleMinutes(p.value)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        scheduleMinutes === p.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="agent-interval" className="text-xs text-muted-foreground">Custom (minutes)</Label>
                  <Input
                    id="agent-interval"
                    type="number"
                    min={1}
                    value={scheduleMinutes}
                    onChange={(e) => setScheduleMinutes(Math.max(1, parseInt(e.target.value || "60", 10) || 60))}
                    className="w-24"
                  />
                </div>
              </div>
            )}

            {triggerType === "event" && (
              <div className="mt-1 grid gap-2 rounded-lg border bg-muted/30 p-3">
                <Label className="text-xs">Run when…</Label>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TRIGGER_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setEventType(o.value)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        eventType === o.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {triggerType === "mention" && (
              <div className="mt-1 grid gap-2 rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="agent-handle" className="text-xs">Handle to listen for (optional)</Label>
                <Input
                  id="agent-handle"
                  value={mentionHandle}
                  onChange={(e) => setMentionHandle(e.target.value)}
                  placeholder={name.trim() ? `Defaults to @${name.trim()}` : "Defaults to the agent's name"}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">
                  The agent runs when this handle is @typed in a channel message. Leave blank to use the agent's name.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="agent-steps">Max steps per run</Label>
              <Input
                id="agent-steps"
                type="number"
                min={1}
                max={50}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Math.max(1, Math.min(50, parseInt(e.target.value || "8", 10) || 8)))}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="agent-active" />
              <Label htmlFor="agent-active">Active</Label>
            </div>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          {/* Test panel (only for saved agents) */}
          {editing && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <Label className="flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" /> Test this agent
              </Label>
              <Textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Optional prompt for this test run..."
                className="min-h-[60px] resize-none bg-background text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch checked={dryRun} onCheckedChange={setDryRun} id="agent-dryrun" />
                  <Label htmlFor="agent-dryrun" className="text-xs">Dry run (no writes)</Label>
                </div>
                <Button size="sm" variant="outline" onClick={handleTest} disabled={running} className="gap-1.5">
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Run test
                </Button>
              </div>
              {outcome && (
                <div className="rounded-lg border bg-background p-2.5 text-sm">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                    Status: <span className="capitalize">{outcome.status}</span> · {outcome.steps} step{outcome.steps === 1 ? "" : "s"}
                  </div>
                  {outcome.result && <p className="whitespace-pre-wrap text-sm text-foreground">{outcome.result}</p>}
                  {outcome.error && <p className="text-xs text-destructive">{outcome.error}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="gap-1.5">
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {editing ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AgentEditDialog
