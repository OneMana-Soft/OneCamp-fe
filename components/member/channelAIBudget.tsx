"use client"

// In-channel AI budget control (Claude-Tag-style channel-level cost control).
// Lets a channel admin/member cap the TOTAL AI token spend in THIS channel per
// day — the shared coworker's @mention replies plus every agent that works
// here — and shows today's spend against that cap. 0 = no channel cap (the
// workspace limit still applies).

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Zap, Loader2 } from "@/lib/icons"
import { toast } from "@/hooks/use-toast"
import { getChannelAIBudget, setChannelAIBudget } from "@/services/agentService"
import { getMyModels, UserModelOption } from "@/services/aiModelService"

interface ChannelAIBudgetProps {
  channelId: string
}

// DEFAULT_MODEL_VALUE is the sentinel Select value for "no channel override"
// (Select can't use an empty-string item value).
const DEFAULT_MODEL_VALUE = "__default__"

// compact token formatter: 1234 -> "1.2k", 2_000_000 -> "2M".
function fmtTokens(n: number): string {
  if (!n) return "0"
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export default function ChannelAIBudget({ channelId }: ChannelAIBudgetProps) {
  const [cap, setCap] = React.useState(0)
  const [usedToday, setUsedToday] = React.useState(0)
  const [modelId, setModelId] = React.useState(DEFAULT_MODEL_VALUE)
  const [models, setModels] = React.useState<UserModelOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    if (!channelId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getChannelAIBudget(channelId),
      getMyModels().catch(() => ({ models: [], selected_model_id: "" })),
    ])
      .then(([b, m]) => {
        if (cancelled) return
        setCap(b.max_daily_tokens || 0)
        setUsedToday(b.tokens_today || 0)
        setModelId(b.ai_model_id ? b.ai_model_id : DEFAULT_MODEL_VALUE)
        setModels(m.models || [])
      })
      .catch(() => {
        /* keep defaults on error */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channelId])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const modelArg = modelId === DEFAULT_MODEL_VALUE ? "" : modelId
      await setChannelAIBudget(channelId, cap, modelArg)
      setDirty(false)
      toast({
        title: "Channel AI settings updated",
        description: cap > 0 ? `Capped at ${fmtTokens(cap)} tokens/day.` : "No channel cap (workspace limit still applies).",
      })
    } catch {
      toast({ title: "Couldn't update", description: "Please try again.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading AI budget…
      </div>
    )
  }

  const pct = cap > 0 ? Math.min(100, Math.round((usedToday / cap) * 100)) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3 w-3" /> AI settings
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 px-3 py-2.5">
        {/* Per-channel default model (0 = workspace default). An agent that pins
            its own model still overrides this; otherwise runs here use it. */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Default model</span>
          <div className="flex items-center gap-2">
            <Select
              value={modelId}
              onValueChange={(v) => {
                setModelId(v)
                setDirty(true)
              }}
              disabled={models.length === 0}
            >
              <SelectTrigger className="h-8 flex-1">
                <SelectValue placeholder="Workspace default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_MODEL_VALUE}>Workspace default</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label || m.model}
                    {m.provider_label ? ` · ${m.provider_label}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Which model AI uses in this channel. An agent that pins its own model overrides this.
          </p>
        </div>

        {/* Per-channel daily token cap. */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Daily token cap</span>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step={1000}
              value={cap}
              onChange={(e) => {
                setCap(Math.max(0, parseInt(e.target.value || "0", 10) || 0))
                setDirty(true)
              }}
              className="h-8 w-32"
              placeholder="0"
              aria-label="Daily token cap for this channel"
            />
            <span className="text-xs text-muted-foreground">tokens / day</span>
            <Button size="sm" className="ml-auto h-8" disabled={!dirty || saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {cap > 0
              ? `Used today: ${fmtTokens(usedToday)} / ${fmtTokens(cap)} (${pct}%). Caps all AI in this channel; resets 00:00 UTC.`
              : `Used today: ${fmtTokens(usedToday)}. No channel cap set — the workspace limit still applies. Resets 00:00 UTC.`}
          </p>
        </div>
      </div>
    </div>
  )
}
