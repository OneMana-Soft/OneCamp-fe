"use client"

/**
 * What the AI did for you — including when it was stopped.
 *
 * WHY THIS EXISTS. The product's central claim is that an agent can only do what
 * the person behind it could, and that a denied call leaves a row naming the
 * reason. Until now the only place that row could be read was the admin audit
 * screen, so the person an agent acts FOR could not see that it had been stopped
 * on their behalf. They had to take the guarantee on trust, which is exactly the
 * trust this product exists to replace.
 *
 * SCOPED BY THE SERVER, not by this component. The endpoint returns the caller's
 * own agent runs and the decisions recorded against them as the actor; the
 * workspace-wide log stays on the admin route. Nothing here filters anything,
 * because a client-side filter over a wider payload would be a privacy control
 * that the network tab defeats.
 *
 * It renders the same row as the admin feed, so a refusal looks the same to the
 * person it happened to as it does to the admin reviewing it.
 */

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ShieldCheck } from "@/lib/icons"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { AIActivityRow } from "@/components/admin/AIActivityCard"
import type { AIActivityItem } from "@/services/aiActivityService"
import { withAI } from "@/components/common/withFeature"

function MyAIActivityCard() {
  const { data, isLoading } = useFetch<{ data: AIActivityItem[] }>(
    `${GetEndpointUrl.MyAIActivity}?limit=25`,
  )
  const items = data?.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          What the AI did for you
        </CardTitle>
        <CardDescription>
          Every action an agent took as you, and every one it was refused. Your own
          record — an admin sees the whole workspace, you see yourself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div role="status" aria-label="Loading your AI activity" className="py-1">
            <SkeletonRows rows={3} />
          </div>
        ) : items.length === 0 ? (
          /* An empty feed is a fact, not a failure: nothing has acted as you yet.
             Saying what WOULD appear is what stops it reading as broken. */
          <p className="py-6 text-sm text-muted-foreground">
            Nothing yet. When an agent acts as you — or is stopped from acting — it
            appears here with the reason.
          </p>
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

/**
 * Gated on AI availability, not left to the page that mounts it.
 *
 * The repo's own guard caught this: an AI component rendered from outside
 * components/ai has to defend itself, because on the AI-free edition — and on v2
 * with AI switched off — it would otherwise render a card whose every call fails.
 * The agents page already checks availability before reaching here; relying on
 * that would make this component correct only from one call site.
 */
export default withAI(MyAIActivityCard)
