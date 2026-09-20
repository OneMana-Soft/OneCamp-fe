"use client"

/**
 * AIActivityCard — the unified "what did the AI do" timeline for admins.
 *
 * Renders the merged feed from /admin/ai/activity: autonomous agent runs and
 * AI-attributable audit entries (web search, public-API/MCP tool calls, AI
 * config changes), newest-first. Read-only governance + debugging surface.
 */

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Sparkles, Shield } from "@/lib/icons"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { initiatorLabel, UNATTENDED_INITIATORS, type AIActivityItem } from "@/services/aiActivityService"
import { ChainPair } from "@/components/admin/ChainPair"

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ""
  const diff = Date.now() - t
  const m = Math.round(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/**
 * A REFUSAL IS NOT A FAILURE, and this is the one place the difference has to be
 * legible. The product's central claim is that an agent is stopped when the
 * person behind it could not have done the thing; painting that the same red as a
 * crashed run teaches an admin to read the guarantee working as something broken,
 * and to stop looking at both.
 *
 * Refused gets the same brand treatment as an allowed call, because both are the
 * permission system answering. Only an actual error is destructive.
 */
function statusTone(status?: string): string {
  switch (status) {
    case "succeeded":
    case "allowed":
      return "text-success"
    case "refused":
      return "text-brand"
    case "failed":
      return "text-destructive"
    case "running":
      return "text-warning"
    default:
      return "text-muted-foreground"
  }
}

/** Never colour alone: the status word is the label, and refused says why. */
function statusLabel(status?: string): string {
  if (status === "refused") return "refused by permissions"
  return status || ""
}


/**
 * One line of the feed, exported so the presentation of a refusal can be tested
 * without mounting the whole card — the same shape SlackImportCard's JobRow uses.
 */
export const AIActivityRow: React.FC<{ item: AIActivityItem }> = ({ item: it }) => {
  const Icon = it.kind === "agent_run" ? Sparkles : Shield
  /**
   * What goes on the top line.
   *
   * The two kinds of row carry different things in `title`. An agent run
   * carries the agent's NAME, which is what a person calls it and belongs at
   * the top. An audit row carries the ACTION, which is a dotted identifier
   * like agent.drill.refused, and it was the boldest text on the line while
   * the sentence explaining what actually happened sat underneath in small
   * muted grey.
   *
   * That is the wrong way round for everyone who reads this feed. Members
   * cannot open the audit log at all, so this is the only account of it they
   * get, and a prospect running the drill met a machine identifier as the
   * headline of the thing they came to see.
   *
   * The action is not hidden: an auditor cross-referencing the log needs the
   * exact string, so it stays on the line as a badge beside the source. What
   * changes is which one is the sentence and which one is the reference.
   */
  const isAuditRow = it.kind !== "agent_run"
  const headline = (isAuditRow && it.summary) || it.title || "AI action"
  const detail = isAuditRow && it.summary ? "" : it.summary
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 shrink-0 rounded-lg bg-muted p-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{headline}</span>
          {it.status && (
            <span className={`shrink-0 text-2xs font-medium ${statusTone(it.status)}`}>{statusLabel(it.status)}</span>
          )}
          {it.source && (
            <Badge variant="outline" className="shrink-0 text-3xs font-normal text-muted-foreground">
              {it.source}
            </Badge>
          )}
        </div>
        {detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{detail}</p>}
        {/* The exact action, kept for anybody matching this against the log. */}
        {isAuditRow && it.summary && it.title && (
          <p className="mt-0.5 font-mono text-2xs text-muted-foreground/70">{it.title}</p>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted-foreground/70">
          {it.actor && <span>{it.actor}</span>}
          <span>·</span>
          <span>{relativeTime(it.at)}</span>
          {/* "Ran on your authority" and "ran while you were asleep" are the
              same actor and different facts. For the person whose agent it is,
              the second is the one they most need to see. */}
          {initiatorLabel(it.initiator) && (
            <>
              <span>·</span>
              <span className={UNATTENDED_INITIATORS.has(it.initiator ?? "") ? "text-warning" : ""}>
                {initiatorLabel(it.initiator)}
              </span>
            </>
          )}
        </div>
        {/* Where this sits in the audit log, for the rows that came from it.
            The feed is the readable account and the log is the provable one;
            without this they were two stories about one event, and a member,
            who cannot open the log, had no way to check the claim at all. */}
        <ChainPair seq={it.seq} prevHash={it.prev_hash} entryHash={it.entry_hash} className="mt-1" />
      </div>
    </li>
  )
}

const AIActivityCard = () => {
  const { data, isLoading } = useFetch<{ data: AIActivityItem[] }>(`${GetEndpointUrl.GetAIActivity}?limit=50`)
  const items = data?.data || []

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> AI activity
        </CardTitle>
        <CardDescription>
          What the AI did across the workspace — agent runs and AI-attributable actions (search, API/MCP
          tool calls, config changes), newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div role="status" aria-label="Loading activity" className="py-1">
            <SkeletonRows rows={4} />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No AI activity yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {items.map((it, i) => (
              <AIActivityRow key={i} item={it} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default AIActivityCard
