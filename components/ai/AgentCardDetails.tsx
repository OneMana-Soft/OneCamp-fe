"use client"

import Link from "next/link"
import { useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { FEATURE_AI, useFeature } from "@/hooks/useClientConfig"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl } from "@/services/endPoints"
import { type AgentCard, setAgentActive, toolLabel } from "@/services/agentService"
import { abilitiesPhrase, autonomyPhrase, reachPhrase, sponsorName, weekPhrase } from "@/lib/agentCardCopy"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpRight, Loader2 } from "@/lib/icons"

/**
 * The agent card on a bot's profile: who it acts for, what it will do on its
 * own, what it may touch and where, and how often governance stopped it this
 * week. Any member sees this; its sponsor and admins can also pause it here.
 *
 * Why it exists: agents now sit in the same channels as people, and every
 * other participant can be looked up. A bot name with "Automated agent" under
 * it asked members to trust something they could not inspect.
 */
export function AgentCardDetails({ botUserId, fallback }: { botUserId: string; fallback: React.ReactNode }) {
  // Gated here rather than with withAI(): with AI off (or on the AI-free
  // edition) the profile still needs its plain About text, not an empty column.
  const aiAvailable = useFeature(FEATURE_AI)
  const { data, isLoading, mutate, isError } = useFetch<{ data: AgentCard }>(
    aiAvailable && botUserId ? `${GetEndpointUrl.GetAgentCard}/${botUserId}` : "",
    undefined,
    { revalidateOnFocus: false, shouldRetryOnError: false },
    // A bot that is not an agent answers 404; that is the ordinary profile,
    // not an error worth a toast.
    { suppressErrorToast: true } as never,
  )
  const card = data?.data

  if (isLoading) {
    return (
      // The rows' own shape: a label beside its value.
      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2.5" role="status" aria-label="Loading this agent">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="contents">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    )
  }
  if (!aiAvailable || !card || isError) return <>{fallback}</>

  const sponsor = sponsorName(card)
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Acts for",
      value: card.sponsor ? (
        <>
          {card.sponsor}
          <span className="text-muted-foreground">. It can only do what {sponsor} can.</span>
        </>
      ) : (
        <span className="text-muted-foreground">Its sponsor, whose name could not be shown</span>
      ),
    },
    { label: "How it works", value: autonomyPhrase(card.autonomy) },
    { label: "Allowed to", value: abilitiesPhrase(card, toolLabel) },
    { label: "Where", value: reachPhrase(card) },
    {
      label: `Last ${card.window_days} days`,
      value: (
        <>
          <span className="tabular-nums">{weekPhrase(card)}</span>
          {card.refusals > 0 && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Refused means it tried something {sponsor} is not allowed to do, and was stopped.
            </span>
          )}
        </>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      {(card.description || !card.active) && (
        <div className="space-y-1">
          {!card.active && (
            <p className="text-ui-sm font-medium text-warning-ink">Paused. It will not run until it is resumed.</p>
          )}
          {card.description && <p className="text-ui-sm text-pretty text-ink-2">{card.description}</p>}
        </div>
      )}

      {/* Label beside value (v3 property rows): stacked, the five rows made an
          agent's card taller than a laptop screen. */}
      <dl data-agent-rows="" className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="pt-px text-meta font-medium text-ink-3">{r.label}</dt>
            <dd className="text-ui-sm text-pretty text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>

      {card.can_manage && <ManageRow card={card} onChanged={() => mutate()} />}
    </div>
  )
}

function ManageRow({ card, onChanged }: { card: AgentCard; onChanged: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const next = !card.active

  const toggle = async () => {
    setBusy(true)
    try {
      await setAgentActive(card.agent_id, next)
      toast({ title: next ? `Resumed ${card.name}` : `Paused ${card.name}` })
      onChanged()
    } catch {
      // The request layer already said what went wrong.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-border/60 pt-4">
      <Button variant="outline" size="sm" onClick={toggle} disabled={busy} className="gap-1.5">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {next ? "Resume agent" : "Pause agent"}
      </Button>
      <Button variant="ghost" size="sm" asChild className="gap-1 text-muted-foreground">
        <Link href="/app/settings/agents">
          Runs and settings <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}
