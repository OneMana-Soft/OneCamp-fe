"use client"

/**
 * GitHubWebhookHealth — surfaces inbound GitHub webhook health stats.
 *
 * Why this exists
 * ---------------
 * The BE records every webhook delivery with a status (processing /
 * completed / failed) and an optional error_message. Before this
 * widget the only way to see that a webhook was failing was to tail
 * server logs. This card presents the last-24h roll-up + last error
 * directly in the admin panel so an operator can spot a flaky
 * configuration (e.g. wrong secret, repo permissions revoked, GH
 * outage) in seconds.
 *
 * One sentence, not three stat tiles: "40 went through, 2 failed" is what
 * the tiles said, at a size that outshouted the section around them. It
 * sits inside the GitHub section as a sub-section, not a card of its own.
 *
 * Polling
 * -------
 * 60s polling is plenty: webhook deliveries are paced by GitHub at
 * most once per repo event, and the admin panel is rarely the active
 * tab. focusThrottleInterval still applies via the global useFetch
 * config so a tab-switch doesn't trigger an extra request.
 */

import React from "react"
import { Webhook } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { useFetch } from "@/hooks/useFetch"
import { relativeTime } from "@/lib/utils/relativeTime"
import { GetEndpointUrl } from "@/services/endPoints"

interface WebhookHealth {
  completed_24h: number
  failed_24h: number
  processing_24h: number
  last_completed_at?: string | null
  last_failed_at?: string | null
  last_error_message?: string | null
}

interface HealthResp {
  health?: WebhookHealth | null
}

/** The last day's deliveries, as one sentence. Pure. */
export function deliverySentence(h?: Pick<WebhookHealth, "completed_24h" | "failed_24h" | "processing_24h"> | null): string {
  const done = h?.completed_24h ?? 0
  const failed = h?.failed_24h ?? 0
  const pending = h?.processing_24h ?? 0
  if (done + failed + pending === 0) return "No deliveries in the last 24 hours."
  const parts = [done === 0 ? "none went through" : `${done} ${done === 1 ? "delivery" : "deliveries"} went through`]
  if (failed > 0) parts.push(`${failed} failed`)
  if (pending > 0) parts.push(`${pending} ${pending === 1 ? "is" : "are"} still being processed`)
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
  return `In the last 24 hours, ${list}.`
}

const GitHubWebhookHealth: React.FC = () => {
  // Refresh every 60s. The endpoint is a cheap aggregate so polling
  // doesn't impose meaningful load even at a fleet level. SWR's
  // refreshWhenHidden / refreshWhenOffline defaults (false) mean a
  // forgotten admin tab does not keep this firing.
  const { data, isLoading, isError, mutate } = useFetch<HealthResp>(
    GetEndpointUrl.GetGitHubWebhookHealth,
    undefined,
    { refreshInterval: 60_000 }
  )

  const h = data?.health
  const total = h ? h.completed_24h + h.failed_24h + h.processing_24h : 0
  const lastTimes = [
    h?.last_completed_at ? `Last delivered ${relativeTime(h.last_completed_at)}.` : "",
    h?.last_failed_at ? `Last failed ${relativeTime(h.last_failed_at)}.` : "",
  ].filter(Boolean).join(" ")

  return (
    <section aria-labelledby="github-webhook-health" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="github-webhook-health" className="flex items-center gap-2 text-sm font-medium">
          <Tile hue={ADMIN_GROUP_HUE.connections} size="sm"><Webhook /></Tile>
          Webhook deliveries
        </h3>
        {/* Words in their ink, not a pill with an icon. */}
        {!isError && h && total > 0 && (
          h.failed_24h > 0 ? (
            <span className="text-xs font-medium text-danger-ink">{h.failed_24h} failed in 24 hours</span>
          ) : (
            <span className="text-xs font-medium text-success-ink">Healthy</span>
          )
        )}
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading the webhook deliveries" className="space-y-1.5">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : isError ? (
        // Small and in place: the section around it still works.
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load the webhook deliveries.</p>
          <Button variant="outline" size="sm" className="h-8" onClick={() => void mutate()}>Try again</Button>
        </div>
      ) : (
        <>
          <p className="text-sm">{deliverySentence(h)}</p>
          {lastTimes && <p className="text-xs text-muted-foreground">{lastTimes}</p>}
          {h?.last_error_message && (
            // Single-line clip with full text in the title attr so a
            // long stack trace doesn't bloat the section.
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-danger-ink">
              <p className="mb-0.5 font-medium">Last error</p>
              <p className="truncate" title={h.last_error_message}>
                {h.last_error_message}
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-pretty">
            A failed delivery is tried again when GitHub sends its next one. Failures that keep coming usually mean
            a stale webhook secret or revoked access to the repository.
          </p>
        </>
      )}
    </section>
  )
}

export default GitHubWebhookHealth
