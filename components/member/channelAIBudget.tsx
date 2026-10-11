"use client"

// In-channel AI budget control (Claude-Tag-style channel-level cost control).
// Lets a channel admin/member cap the TOTAL AI token spend in THIS channel per
// day — the shared coworker's @mention replies plus every agent that works
// here — and shows today's spend against that cap. 0 = no channel cap (the
// workspace limit still applies).

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Cpu, Zap, Loader2 } from "@/lib/icons"
import { DetailsRow, DetailsSection } from "@/components/channel/details/detailsParts"
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

  // Saved as it changes (C51): the model when it is picked, the cap when the
  // field is left. A moss "Saved" says so for two seconds; no Save button.
  const [saved, setSaved] = React.useState(false)
  const savedTimer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(savedTimer.current), [])
  const save = async (nextCap: number, nextModel: string) => {
    setSaving(true)
    try {
      await setChannelAIBudget(channelId, nextCap, nextModel === DEFAULT_MODEL_VALUE ? "" : nextModel)
      setDirty(false)
      setSaved(true)
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setSaved(false), 2000)
    } catch {
      toast({ title: "Couldn't update", description: "Please try again.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-meta text-ink-3">
        <Loader2 className="size-3.5 animate-spin" /> Loading AI settings…
      </div>
    )
  }

  const pct = cap > 0 ? Math.min(100, Math.round((usedToday / cap) * 100)) : 0

  return (
    <DetailsSection
      title="AI settings"
      action={saved ? <span role="status" className="chip h-5 animate-pill-in bg-camp-moss-tint text-camp-moss-ink shadow-none">Saved</span> : saving ? <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Saving" /> : null}
    >
      {/* Which model AI uses in this channel: summaries, @mention answers and
          agent runs (an agent that pins its own model overrides it). */}
      <DetailsRow icon={<Cpu />} label="Default model" description="For summaries, @mention answers and agent runs here">
        <Select
          value={modelId}
          onValueChange={(v) => {
            setModelId(v)
            void save(cap, v)
          }}
          disabled={models.length === 0 || saving}
        >
          <SelectTrigger className="h-8 w-44" aria-label="Default model">
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
      </DetailsRow>
      <DetailsRow
        icon={<Zap />}
        label="Daily token cap"
        controlId={`ai-cap-${channelId}`}
        description={
          <span className="flex items-center gap-2">
            {cap > 0 && (
              <span aria-hidden="true" className="relative h-1 w-[72px] overflow-hidden rounded-full bg-press">
                <span className="absolute inset-0 origin-left rounded-full bg-progress" style={{ transform: `scaleX(${pct / 100})` }} />
              </span>
            )}
            <span className="tabular-nums">{cap > 0 ? `${fmtTokens(usedToday)} of ${fmtTokens(cap)} today` : `${fmtTokens(usedToday)} today · no cap (the workspace limit applies)`}</span>
          </span>
        }
      >
        <Input
          id={`ai-cap-${channelId}`}
          type="number"
          min={0}
          step={1000}
          value={cap}
          onChange={(e) => {
            setCap(Math.max(0, parseInt(e.target.value || "0", 10) || 0))
            setDirty(true)
          }}
          onBlur={() => { if (dirty) void save(cap, modelId) }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur() }}
          className="h-8 w-28 tabular-nums"
          placeholder="0"
        />
      </DetailsRow>
    </DetailsSection>
  )
}
