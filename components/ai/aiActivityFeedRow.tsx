"use client"

import * as React from "react"
import { ListRow } from "@/components/ui/listRow"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { ChainPair } from "@/components/admin/ChainPair"
import { Bot, Shield, Sparkles } from "@/lib/icons"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { initiatorLabel, UNATTENDED_INITIATORS, type AIActivityItem } from "@/services/aiActivityService"

/**
 * One entry of your AI record, as a row of the Activity feed.
 *
 * The Activity tab used to show the settings page's rows: an icon in a grey
 * chip, the summary as the headline, the action id, the actor's email, the
 * time and the chain position on four lines, 103px a row beside the other
 * tabs' 64. Here the entry takes the other tabs' anatomy (ActivityCard):
 * who acted as a mark with a badge for the kind of entry, what it did and
 * its outcome on the first line, what it acted on under it, and when on the
 * right. The evidence (the chain position, the exact action, who started it)
 * is one press away, so the row stays the feed's height and the proof stays
 * on the page.
 */

/** Who acted, for an audit entry, by the family of its action. */
const ACTORS: [prefix: string, label: string][] = [
    ["agent.", "An agent"],
    ["mcp.", "A connected tool"],
    ["api.", "An app with your key"],
    ["ai.", "The AI assistant"],
]

function whoActed(it: AIActivityItem): { label: string; key: string } {
    if (it.kind === "agent_run") return { label: it.title || "An agent", key: it.agent_id || it.title || "agent" }
    const hit = ACTORS.find(([prefix]) => it.title?.startsWith(prefix))
    return { label: hit?.[1] ?? "The AI", key: hit?.[0] ?? "ai." }
}

/**
 * A refusal is not a failure: the permission system answering, drawn in the
 * same tone the admin feed gives it (AIActivityCard), never the danger red.
 */
function statusTone(status?: string): string {
    switch (status) {
        case "succeeded":
        case "allowed":
            return "text-success-ink"
        case "refused":
            return "text-primary"
        case "failed":
            return "text-danger-ink"
        case "running":
            return "text-warning-ink"
        default:
            return "text-muted-foreground"
    }
}

const statusWord = (status?: string) => (status === "refused" ? "refused by permissions" : status || "")

export function AIActivityFeedRow({ item: it }: { item: AIActivityItem }) {
    const [open, setOpen] = React.useState(false)
    const run = it.kind === "agent_run"
    const who = whoActed(it)
    const did = run ? (it.status === "running" ? "is running" : "ran") : "acted as you"
    // What it acted on. An audit entry's summary is the sentence; a run's is its result.
    const what = it.summary || (run ? it.source : it.title) || ""
    const started = initiatorLabel(it.initiator)
    const evidence = Boolean(it.entry_hash || (!run && it.title) || it.source || started)

    const leading = (
        <div className="relative shrink-0">
            {/* A named agent is drawn like a person, in its own colour. An
                entry that names no agent shows the kind of actor instead. */}
            {run && it.title ? (
                <IdentityMark variant="avatar" size={36} id={who.key} label={who.label} />
            ) : (
                <span
                    aria-hidden
                    data-hue={hueFor(who.key)}
                    className={cn(avatarHueClass(hueFor(who.key)), "flex size-9 items-center justify-center rounded-full [&>svg]:size-4")}
                >
                    <Bot strokeWidth={1.75} />
                </span>
            )}
            <div
                aria-hidden
                className="absolute -bottom-1 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground ring-2 ring-background"
            >
                {run ? <Sparkles className="h-2.5 w-2.5" strokeWidth={2.5} /> : <Shield className="h-2.5 w-2.5" strokeWidth={2.5} />}
            </div>
        </div>
    )

    const title = (
        <span className="flex w-full min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate">
                <span className="font-semibold text-foreground">{who.label}</span>{" "}
                <span className="font-normal text-muted-foreground">{did}</span>
            </span>
            {it.status ? (
                <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium", statusTone(it.status))}>
                    {statusWord(it.status)}
                </span>
            ) : null}
        </span>
    )

    const toggle = () => setOpen((o) => !o)
    return (
        <ListRow
            data-feed-row=""
            density="comfortable"
            leading={leading}
            title={title}
            meta={it.at ? formatListTimestamp(it.at) : undefined}
            subtitle={what || null}
            className={evidence ? undefined : "cursor-default"}
            {...(evidence
                ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-expanded": open,
                      onClick: toggle,
                      onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              toggle()
                          }
                      },
                  }
                : {})}
        >
            {open ? (
                <div data-feed-evidence="" className="mt-1.5 space-y-0.5 text-2xs text-muted-foreground">
                    {/* The exact action, for anybody matching this against the log. */}
                    {!run && it.title ? <p className="font-mono">{it.title}</p> : null}
                    {it.source || started ? (
                        <p>
                            {it.source ? <span>{it.source}</span> : null}
                            {it.source && started ? <span> · </span> : null}
                            {started ? (
                                <span className={UNATTENDED_INITIATORS.has(it.initiator ?? "") ? "text-warning-ink" : undefined}>{started}</span>
                            ) : null}
                        </p>
                    ) : null}
                    <ChainPair seq={it.seq} prevHash={it.prev_hash} entryHash={it.entry_hash} />
                </div>
            ) : null}
        </ListRow>
    )
}
