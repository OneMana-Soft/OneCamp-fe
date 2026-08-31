"use client"

import { Bot } from "lucide-react"

import { withAI } from "@/components/common/withFeature"
import { Skeleton } from "@/components/ui/skeleton"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { type AgentOutcome, sumOutcomes } from "@/services/agentService"

/**
 * What this person's agents have been doing, and how much of it they kept.
 *
 * WHY THIS EXISTS. The backend has built an end-user "show your work" feed for
 * agent runs and an acceptance record for what those agents proposed, and
 * neither had any interface: the activity endpoint had no caller at all, and the
 * acceptance numbers appeared only on the admin agents page. So the person whose
 * work the agents are doing could not see what they did.
 *
 * BOTH NUMBERS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. Runs is how busy the
 * agents were, which is activity. Kept is how much of it a person actually
 * wanted, which is the only one that says whether any of it was worth having.
 * Showing activity alone is how a dashboard reports a great week for an agent
 * nobody agreed with.
 *
 * Self-hides when there is nothing to report, like the other cards on this page,
 * rather than occupying space to say "no activity".
 */

interface ActivityItem {
    run_id: string
    agent_name: string
    status: string
    summary: string
    started_at: string
}

function AgentWorkCardInner() {
    const { data: activity, isLoading } = useFetch<{ data: ActivityItem[] }>(
        `${GetEndpointUrl.GetAgentActivity}?limit=5`,
    )
    const { data: outcomes } = useFetch<{ data: Record<string, AgentOutcome> }>(
        `${GetEndpointUrl.GetAgents}/outcomes`,
    )

    const items = activity?.data ?? []
    const kept = sumOutcomes(outcomes?.data)

    if (isLoading) {
        return (
            <section className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                <div className="px-4 py-3.5 space-y-2" role="status" aria-label="Loading your agents' work">
                    <Skeleton className="h-3 w-1/3 rounded" />
                    <Skeleton className="h-2.5 w-11/12 rounded" />
                    <Skeleton className="h-2.5 w-3/5 rounded" />
                </div>
            </section>
        )
    }

    // Nothing has run and nothing was decided: there is no story to tell yet.
    if (items.length === 0 && kept.decided === 0) return null

    return (
        <section className="rounded-xl border border-border/60 bg-card/40 overflow-hidden" aria-labelledby="agent-work-heading">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <div className="bg-primary/10 p-1 rounded-md">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <h2 id="agent-work-heading" className="text-sm font-semibold tracking-tight">
                    Your agents
                </h2>
                {kept.decided > 0 && (
                    <span className="ml-auto text-2xs text-muted-foreground">
                        you kept {kept.approved} of {kept.decided} they proposed
                    </span>
                )}
            </div>

            <ul className="divide-y divide-border/40">
                {items.map((item) => (
                    <li key={item.run_id} className="px-4 py-2.5">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xs font-medium text-foreground truncate">{item.agent_name}</span>
                            {item.status === "failed" && (
                                <span className="text-3xs text-destructive shrink-0">failed</span>
                            )}
                        </div>
                        <p className="mt-0.5 text-2xs text-muted-foreground line-clamp-2">{item.summary}</p>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// Gated on AI availability: the AI-free edition has no agents at all, and on the
// AI edition with AI switched off both endpoints behind this card refuse, so
// without the gate it would render an empty box and two failing requests on
// every dashboard load.
export const AgentWorkCard = withAI(AgentWorkCardInner)
