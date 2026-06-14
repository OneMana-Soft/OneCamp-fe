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
 * Polling
 * -------
 * 60s polling is plenty: webhook deliveries are paced by GitHub at
 * most once per repo event, and the admin panel is rarely the active
 * tab. focusThrottleInterval still applies via the global useFetch
 * config so a tab-switch doesn't trigger an extra request.
 */

import React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertTriangle, RefreshCw, Webhook } from "lucide-react"
import { useFetch } from "@/hooks/useFetch"
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

function formatRelative(iso?: string | null): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return "unknown"
  if (ms < 60_000) return "just now"
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

const GitHubWebhookHealth: React.FC = () => {
  // Refresh every 60s. The endpoint is a cheap aggregate so polling
  // doesn't impose meaningful load even at a fleet level. SWR's
  // refreshWhenHidden / refreshWhenOffline defaults (false) mean a
  // forgotten admin tab does not keep this firing.
  const { data, isLoading, isError } = useFetch<HealthResp>(
    GetEndpointUrl.GetGitHubWebhookHealth,
    undefined,
    { refreshInterval: 60_000 }
  )

  const h = data?.health

  // Three visual states: healthy, degraded, unconfigured. We never
  // show a hard error toast for this widget because a transient 5xx
  // on the health endpoint is not actionable for the user — instead
  // we render an unobtrusive "couldn't load" inline message and let
  // SWR recover on its own.
  const isHealthy = !!h && h.failed_24h === 0
  const isDegraded = !!h && h.failed_24h > 0
  const headlineBadge = (() => {
    if (isLoading) return <Badge variant="outline">Loading…</Badge>
    if (isError) return <Badge variant="outline" className="text-amber-600 border-amber-300">Unavailable</Badge>
    if (isDegraded) return (
      <Badge className="bg-red-500/10 text-red-700 border-red-200 dark:text-red-300">
        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
        {h!.failed_24h} failed in 24h
      </Badge>
    )
    if (isHealthy) return (
      <Badge className="bg-green-500/10 text-green-700 border-green-200 dark:text-green-400">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        Healthy
      </Badge>
    )
    return <Badge variant="outline">No data yet</Badge>
  })()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Webhook className="h-4 w-4" />
          GitHub webhook delivery
          <span className="ml-auto">{headlineBadge}</span>
        </CardTitle>
        <CardDescription>
          Inbound deliveries from GitHub for the last 24 hours. Failures retry
          automatically on GitHub&apos;s next delivery; persistent failures
          usually mean a stale secret or revoked repo access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-2xl font-semibold">{h?.completed_24h ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-2xl font-semibold">
              {h && h.failed_24h > 0 ? (
                <span className="text-red-600 dark:text-red-400">{h.failed_24h}</span>
              ) : (
                h?.failed_24h ?? "—"
              )}
            </div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
          <div className="rounded-md border bg-card px-3 py-2">
            <div className="text-2xl font-semibold">
              {h && h.processing_24h > 0 ? (
                <span className="text-blue-600 dark:text-blue-400">
                  {h.processing_24h}
                  <RefreshCw className="ml-1 inline h-4 w-4 animate-spin" />
                </span>
              ) : (
                h?.processing_24h ?? "—"
              )}
            </div>
            <div className="text-xs text-muted-foreground">In-flight</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            Last successful:{" "}
            <span className="font-medium text-foreground">{formatRelative(h?.last_completed_at)}</span>
          </div>
          {h?.last_failed_at && (
            <div>
              Last failure:{" "}
              <span className="font-medium text-foreground">{formatRelative(h.last_failed_at)}</span>
            </div>
          )}
        </div>

        {h?.last_error_message && (
          // Single-line clip with full text in the title attr so a
          // long stack trace doesn't bloat the card. Operators can
          // hover or pull from the DB for the full message.
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            <div className="font-semibold mb-0.5">Last error</div>
            <div className="truncate" title={h.last_error_message}>
              {h.last_error_message}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default GitHubWebhookHealth
