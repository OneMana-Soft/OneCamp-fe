"use client"

import { withAI } from "@/components/common/withFeature"
import { Spark } from "@/components/ui/graphics/motifs"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"

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

/** States that mean a job is still going or waiting on you (hub.md H19). */
const LIVE = new Set(["running", "queued", "pending", "waiting", "awaiting_input", "awaiting"])

/** The jobs worth a strip on Home: running or waiting, three at most. Pure. */
export function liveJobs(items: ActivityItem[]): ActivityItem[] {
    return items.filter((i) => LIVE.has((i.status || "").toLowerCase())).slice(0, 3)
}

/**
 * H19: while an agent is working for you, one compact row per job on a sunken
 * well above Projects. Nothing at all otherwise: finished work lives in
 * Activity > Agents and the agent's record, so Home no longer lists history.
 */
function AgentWorkCardInner({ className }: { className?: string }) {
    const { data: activity } = useFetch<{ data: ActivityItem[] }>(`${GetEndpointUrl.GetAgentActivity}?limit=5`, undefined, {
        refreshInterval: 20_000,
    })
    const jobs = liveJobs(activity?.data ?? [])
    if (jobs.length === 0) return null
    return (
        <section aria-label="Agents at work" className={cn("hub-pop rounded-lg bg-sunken p-1.5", className)} data-agent-strip="">
            {jobs.map((job) => {
                const waiting = job.status.toLowerCase().startsWith("await") || job.status === "waiting"
                return (
                    <div key={job.run_id} className="hub-row" data-density="compact" data-lead="24">
                        <span />
                        <span className="hub-row-lead">
                            <span className="avatar-agent grid size-6 place-items-center rounded-[32%] text-white" aria-hidden>
                                <Spark className="size-3.5" />
                            </span>
                        </span>
                        <span className="min-w-0 truncate text-ui">
                            <span className="font-medium">{job.agent_name}</span>
                            {job.summary ? <span className="text-ink-2"> · {job.summary}</span> : null}
                        </span>
                        {waiting ? (
                            <span className="rounded-[5px] bg-camp-sun-tint px-1.5 text-micro text-camp-sun-ink">Needs you</span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-micro text-ink-3">
                                <span className="size-3 animate-spin rounded-full border-[1.5px] border-agent/25 border-r-agent border-t-agent" aria-hidden />
                                Working
                            </span>
                        )}
                    </div>
                )
            })}
        </section>
    )
}

// Gated on AI availability: the AI-free edition has no agents at all, and on the
// AI edition with AI switched off both endpoints behind this card refuse, so
// without the gate it would render an empty box and two failing requests on
// every dashboard load.
export const AgentWorkCard = withAI(AgentWorkCardInner)
