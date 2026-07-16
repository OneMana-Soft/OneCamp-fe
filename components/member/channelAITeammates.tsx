"use client"

// In-channel "AI teammates" management. Lists the workspace's mention-trigger
// AI agents and lets a channel admin/member toggle whether each one responds to
// @mentions in THIS channel (the Slack/Claude-Tag "add the AI to a channel"
// model). Toggling edits the agent's channel scope on the backend, so it stays
// in sync with the Agent Builder's channel picker.

import * as React from "react"
import { Switch } from "@/components/ui/switch"
import { Sparkles, Loader2 } from "@/lib/icons"
import { toast } from "@/hooks/use-toast"
import {
  getChannelAITeammates,
  setChannelAITeammate,
  type ChannelAgentOption,
} from "@/services/agentService"

interface ChannelAITeammatesProps {
  channelId: string
}

export default function ChannelAITeammates({ channelId }: ChannelAITeammatesProps) {
  const [options, setOptions] = React.useState<ChannelAgentOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    if (!channelId) return
    let cancelled = false
    setLoading(true)
    getChannelAITeammates(channelId)
      .then((opts) => {
        if (!cancelled) setOptions(opts)
      })
      .catch(() => {
        /* keep empty on error */
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channelId])

  const handleToggle = async (opt: ChannelAgentOption, next: boolean) => {
    if (busy[opt.id]) return
    setBusy((b) => ({ ...b, [opt.id]: true }))
    // Optimistic.
    setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, in_channel: next, global: false } : o)))
    try {
      await setChannelAITeammate(channelId, opt.id, next)
      toast({
        title: next ? `${opt.name} added` : `${opt.name} removed`,
        description: next
          ? "It now replies to @mentions in this channel."
          : "It no longer replies in this channel.",
      })
    } catch {
      // Revert on failure.
      setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, in_channel: !next } : o)))
      toast({ title: "Couldn't update", description: "Please try again.", variant: "destructive" })
    } finally {
      setBusy((b) => ({ ...b, [opt.id]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading AI teammates…
      </div>
    )
  }

  if (options.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" /> AI teammates
      </div>
      <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60">
        {options.map((opt) => (
          <div key={opt.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{opt.name}</span>
                  <span className="rounded bg-primary/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-primary">
                    AI
                  </span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {opt.in_channel
                    ? "Replies to @mentions here"
                    : opt.global
                      ? "Currently replies everywhere it's mentioned"
                      : "Not in this channel"}
                </p>
              </div>
            </div>
            <Switch
              checked={opt.in_channel}
              disabled={!!busy[opt.id]}
              onCheckedChange={(v) => handleToggle(opt, v)}
              aria-label={opt.in_channel ? `Remove ${opt.name} from channel` : `Add ${opt.name} to channel`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
