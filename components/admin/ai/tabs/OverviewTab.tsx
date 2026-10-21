"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SavedTick } from "@/components/ui/saveStatus"
import { SETTINGS_STACK, SettingsCardError, SettingsRowsSkeleton, SettingsList } from "@/components/ui/settingsSection"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { Spark } from "@/components/ui/graphics/motifs"
import { Loader2 } from "@/lib/icons"
import { useAIConfig } from "@/components/admin/ai/useAIConfig"
import { useConfigSwitch } from "@/components/admin/ai/aiSwitch"
import { SelfTestRows, useSelfTest } from "@/components/admin/ai/AISelfTestSection"
import AgentActiveWorkPanel from "@/components/admin/AgentActiveWorkPanel"
import { useFetch } from "@/hooks/useFetch"
import { AdminGet } from "@/services/endpoints/admin"
import { getAIUsage, setAIEnabled, type AIConfig, type AIUsage } from "@/services/aiModelService"
import { getAgentInventory } from "@/services/agentService"
import type { AIActivityItem } from "@/services/aiActivityService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { AISubTab } from "@/components/admin/ai/aiTabs"

/** Where a refusal is on the record: the audit log, agent entries. */
const REFUSALS_HREF = "/app/admin?tab=audit&category=agent#audit-log"

/** The model a job runs on, as a person says it: "llama3.2" from "llama3.2:3b". */
function modelName(m?: string) {
  return (m || "").trim()
}

/** "Claude Sonnet for chat · nomic-embed for search · 4 agents active". */
export function statusLine(c: AIConfig, activeAgents: number | null): string {
  const parts: string[] = []
  const chat = modelName(c.chat_model)
  const search = modelName(c.embedding_model)
  parts.push(chat ? `${chat} for chat` : "No chat model yet")
  if (search) parts.push(`${search} for search`)
  if (activeAgents !== null) parts.push(`${activeAgents} ${activeAgents === 1 ? "agent" : "agents"} active`)
  return parts.join(" · ")
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Agent runs today and refusals this week, counted from the AI activity feed
 * (there is no count endpoint, so this reads the newest 200 entries).
 */
export function countActivity(items: AIActivityItem[], now = new Date()) {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const weekAgo = now.getTime() - 7 * DAY_MS
  let runsToday = 0
  let refusalsWeek = 0
  for (const it of items) {
    const at = new Date(it.at).getTime()
    if (!Number.isFinite(at)) continue
    if (it.kind === "agent_run" && at >= startOfDay.getTime()) runsToday++
    if (it.status === "refused" && at >= weekAgo) refusalsWeek++
  }
  return { runsToday, refusalsWeek }
}

/** A 96px stat tile: a big tabular number and a line under it. */
function StatTile({
  value,
  label,
  lead,
  tone,
  href,
  loading,
}: {
  value: React.ReactNode
  label: string
  lead?: React.ReactNode
  tone?: "danger"
  href?: string
  loading?: boolean
}) {
  const body = (
    <>
      {lead}
      <span className="min-w-0">
        <span data-stat-value="" className={`ai-stat-value block tabular-nums ${tone === "danger" ? "text-danger-ink" : "text-foreground"}`}>
          {loading ? "–" : value}
        </span>
        <span className="block text-xs text-muted-foreground">
          {label}
          {href ? " →" : ""}
        </span>
      </span>
    </>
  )
  return href ? (
    <Link href={href} data-stat-tile="" data-tone={tone} className="ai-stat set-card hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
      {body}
    </Link>
  ) : (
    <div data-stat-tile="" data-tone={tone} className="ai-stat set-card">
      {body}
    </div>
  )
}

/**
 * Overview (design v3, admin §A15, mock M6): is AI working, and what is it
 * doing. One status card with the one master switch and the self-test, three
 * numbers, and the agents at work right now.
 */
export default function OverviewTab({ onOpenTab }: { onOpenTab?: (t: AISubTab) => void }) {
  const { config, isLoading, error, refresh } = useAIConfig()
  const master = useConfigSwitch("enabled", setAIEnabled)
  const test = useSelfTest()

  const [usage, setUsage] = useState<AIUsage | null>(null)
  const [usageRead, setUsageRead] = useState(false)
  const [activeAgents, setActiveAgents] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    getAIUsage()
      .then((u) => live && setUsage(u ?? null))
      .catch(() => {})
      .finally(() => live && setUsageRead(true))
    getAgentInventory()
      .then((inv) => live && setActiveAgents((inv?.agents ?? []).filter((a) => a.is_active).length))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  const activity = useFetch<{ data: AIActivityItem[] }>(`${AdminGet.GetAIActivity}?limit=200`)
  const counts = useMemo(() => countActivity(activity.data?.data ?? []), [activity.data])

  if (isLoading && !config) {
    return (
      <div role="status" aria-label="Loading the AI overview">
        <SettingsList>
          <SettingsRowsSkeleton rows={2} />
        </SettingsList>
      </div>
    )
  }
  if (!config) {
    return (
      <SettingsList>
        <SettingsCardError
          what="Couldn't load the AI settings."
          reason={error ? apiErrorMessage(error, "Try again in a moment.") : undefined}
          onRetry={() => void refresh()}
        />
      </SettingsList>
    )
  }

  const on = master.checked
  const ws = usage?.workspace ?? { used: 0, limit: 0 }
  const pct = ws.limit > 0 ? Math.min(100, Math.round((ws.used / ws.limit) * 100)) : 0

  return (
    <div className={SETTINGS_STACK}>
      <div className="space-y-3">
        {/* The status card: r16, e1, 24px in. */}
        <section id="ai-models-status" data-settings-card="" data-ai-hero="" className="set-card ai-hero scroll-mt-5" aria-labelledby="ai-hero-title">
          <span aria-hidden="true" className="ai-hero-mark avatar-agent">
            <Spark className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ai-hero-title" className="flex items-center gap-2">
              <span className="text-title-3 font-semibold text-foreground">{on ? "OneCamp AI is on" : "OneCamp AI is off"}</span>
              <SavedTick status={master.status} />
            </h2>
            <p data-ai-status-line="" className="mt-0.5 text-xs text-muted-foreground text-pretty">
              {on ? statusLine(config, activeAgents) : "Nobody in the workspace can use the assistant or agents until it is on."}
            </p>
            {master.status.state === "error" && master.status.error && (
              <p role="alert" className="mt-1 text-xs font-medium text-danger-ink">
                {master.status.error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 max-sm:w-full max-sm:justify-between">
            <Button variant="outline" size="sm" onClick={() => void test.run()} disabled={test.running || !on}>
              {test.running ? <Loader2 className="animate-spin" /> : null}
              {test.running ? "Testing…" : "Run self-test"}
            </Button>
            <Switch
              aria-label="OneCamp AI"
              className="ai-big-switch"
              checked={on}
              disabled={master.status.state === "saving"}
              onCheckedChange={(v) => void master.set(v)}
              data-shake={master.status.state === "error" ? "true" : undefined}
            />
          </div>
        </section>
        <SelfTestRows test={test} config={config} />
      </div>

      {/* Three numbers. */}
      <div data-ai-stats="" className="grid gap-3 sm:grid-cols-3">
        <StatTile
          loading={!usageRead}
          lead={ws.limit > 0 ? <ProgressRing value={pct} size={36} weight={4} label={`${pct}% of today's token budget`} /> : undefined}
          value={ws.limit > 0 ? `${pct}%` : ws.used.toLocaleString()}
          label={ws.limit > 0 ? "of today's token budget" : "tokens today, no daily budget"}
        />
        <StatTile loading={activity.isLoading} value={counts.runsToday.toLocaleString()} label="agent runs today" />
        <StatTile
          loading={activity.isLoading}
          value={counts.refusalsWeek.toLocaleString()}
          label={counts.refusalsWeek === 1 ? "refusal this week" : "refusals this week"}
          tone={counts.refusalsWeek > 0 ? "danger" : undefined}
          href={REFUSALS_HREF}
        />
      </div>

      {/* The agents at work now; the panel hides itself when none is. */}
      <AgentActiveWorkPanel title="Working now" />

      {onOpenTab && (
        <p className="text-xs text-muted-foreground">
          Models, agents, limits and the record each have a tab above.{" "}
          <button type="button" className="text-brand-text underline-offset-2 hover:underline" onClick={() => onOpenTab("models")}>
            Choose the models
          </button>
        </p>
      )}
    </div>
  )
}
