"use client"

// In-channel "AI teammates" management. Lists the workspace's mention-trigger
// AI agents and lets a channel admin/member toggle whether each one responds to
// @mentions in THIS channel (the Slack/Claude-Tag "add the AI to a channel"
// model). Toggling edits the agent's channel scope on the backend, so it stays
// in sync with the Agent Builder's channel picker.

import * as React from "react"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { Switch } from "@/components/ui/switch"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Loader2 } from "@/lib/icons"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { DetailsSection } from "@/components/channel/details/detailsParts"
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
    } catch (e) {
      // Revert on failure.
      setOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, in_channel: !next } : o)))
      toast({
        title: next ? `Couldn't add ${opt.name} to this channel` : `Couldn't take ${opt.name} out of this channel`,
        description: apiErrorMessage(e, "Try again in a moment."),
        variant: "destructive",
      })
    } finally {
      setBusy((b) => ({ ...b, [opt.id]: false }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-meta text-ink-3">
        <Loader2 className="size-3.5 animate-spin" /> Loading AI teammates…
      </div>
    )
  }

  if (options.length === 0) return null

  // A section of the channel's Details (design v3 chat, C51): "AI teammates"
  // as a sentence-case title over a card of 56px rows, each the agent's
  // square, its name and tag, what it does here, and its switch.
  return (
    <DetailsSection title={`AI teammates · ${options.length}`}>
      {options.map((opt) => (
        <div key={opt.id} data-ai-teammate="" className="flex min-h-14 items-center gap-3 px-3 py-2.5">
          <span className="size-8 shrink-0"><AgentAvatar /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-ui font-medium text-ink">{opt.name}</span>
              <PrincipalTag kind="ai" />
            </div>
            <p className="truncate text-meta text-ink-3">
              {opt.in_channel
                ? "Replies to @mentions here"
                : opt.global
                  ? "Currently replies everywhere it's mentioned"
                  : "Not in this channel"}
            </p>
          </div>
          <Switch
            checked={opt.in_channel}
            disabled={!!busy[opt.id]}
            onCheckedChange={(v) => handleToggle(opt, v)}
            aria-label={opt.in_channel ? `Remove ${opt.name} from channel` : `Add ${opt.name} to channel`}
          />
        </div>
      ))}
    </DetailsSection>
  )
}
