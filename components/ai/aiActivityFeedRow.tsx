"use client"

/**
 * One entry of your agents record (hub.md AI14), as a feed HubRow:
 *
 *   lead    the named agent's 32px square with a kind badge: a spark for an
 *           action, a shield for a refusal; a connected tool or an app key is
 *           a neutral square;
 *   line 1  "Release Captain acted as you · created 6 tasks", or "The
 *           governance drill tried to post in #drill-finance", and the outcome
 *           as a tag. A refusal is the agent's tint with a shield: the
 *           permission system answering, never the accent and never danger red.
 *           A practice run carries a neutral Drill tag, so it never reads as a
 *           real refusal;
 *   line 2  why: the reason it was refused, or what it acted on;
 *   meta    when.
 *
 * Pressing it opens the evidence (AI15) under the row: its place in the chain,
 * the exact action, who started it, and the hash pair, which is what makes the
 * row checkable rather than something this workspace says.
 */
import * as React from "react"

import { HubRow } from "@/components/ui/hubRow"
import { KindBadge } from "@/components/ui/kindBadge"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { shortHash } from "@/components/admin/ChainPair"
import { ChevronDown, Copy, Link2, Plug, Shield } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { UNATTENDED_INITIATORS, type AIActivityItem } from "@/services/aiActivityService"
import { recordActor, sourceWords, startedByWords } from "@/components/ai/agentRecord"
import { recordLines, type RecordOutcome } from "@/components/ai/proveIt"

/** The outcome tag (AI14): tint and words per outcome. */
const OUTCOME: Record<Exclude<RecordOutcome, null>, { label: string; tone: string }> = {
    done: { label: "Done", tone: "bg-camp-moss-tint text-camp-moss-ink" },
    refused: { label: "Refused by permissions", tone: "bg-agent-muted text-agent-ink" },
    failed: { label: "Failed", tone: "bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-danger-ink" },
    waiting: { label: "Waiting for you", tone: "bg-camp-sun-tint text-camp-sun-ink" },
    running: { label: "Running", tone: "bg-hover text-ink-2 ring-1 ring-inset ring-line" },
    attempt: { label: "Attempt recorded", tone: "bg-hover text-ink-2 ring-1 ring-inset ring-line" },
}

/**
 * A tag after the row's words is a word of its own, so a space comes before
 * it (here and before Drill): the row reads "post in #drill-finance Drill
 * Refused by permissions", aloud and when copied. A margin alone drew the gap
 * and read "#drill-financeDrill" (QA F-45). The space and a 2px margin make
 * the 6px the margin was.
 */
export function OutcomeTag({ outcome }: { outcome: RecordOutcome }) {
    if (!outcome) return null
    const o = OUTCOME[outcome]
    return (
        <>
            {" "}
            <span data-outcome={outcome} className={cn("ml-0.5 inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] px-1.5 align-[1px] text-3xs font-medium leading-none tracking-[0.005em]", o.tone)}>
                {outcome === "refused" ? <Shield className="size-3" aria-hidden /> : null}
                {o.label}
            </span>
        </>
    )
}

export type ChainState = "idle" | "checking" | "ok" | "broken"

export interface AIActivityFeedRowProps {
    item: AIActivityItem
    /** Prove it's sweep: hidden, ticking, ticked moss. */
    chain?: ChainState
    /** This row's place in the sweep, for its 30ms stagger. */
    sweepIndex?: number
    /** This entry does not match the one before it. */
    broken?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    separated?: boolean
}

export function AIActivityFeedRow({ item: it, chain = "idle", sweepIndex = 0, broken, open: openProp, onOpenChange, separated }: AIActivityFeedRowProps) {
    const [openState, setOpenState] = React.useState(false)
    const open = openProp ?? openState
    const setOpen = (v: boolean) => (onOpenChange ? onOpenChange(v) : setOpenState(v))
    const run = it.kind === "agent_run"
    const who = recordActor(it)
    const lines = recordLines(it)
    const started = startedByWords(it.initiator)
    const evidence = Boolean(it.entry_hash || (!run && it.title) || it.source || started)
    const machine = who.kind === "tool" || who.kind === "app"

    const lead = (
        <>
            <span className="block size-8">
                {machine ? (
                    <BotAvatar>
                        <Plug />
                    </BotAvatar>
                ) : (
                    <AgentAvatar />
                )}
            </span>
            <KindBadge kind={lines.outcome === "refused" ? "refused" : "agent"} />
            {/* The chain link in the gutter, which Prove it ticks to moss. */}
            <span
                aria-hidden
                data-chain={chain === "idle" ? undefined : broken ? "broken" : chain === "checking" ? "checking" : "ok"}
                className={cn(
                    "absolute -left-[22px] top-[9px] grid size-3.5 place-items-center text-ink-4 opacity-0 transition-[opacity,transform,color] duration-200 [&_svg]:size-3.5",
                    chain !== "idle" && "opacity-100",
                    chain === "checking" && "scale-[.6]",
                    (chain === "ok" || chain === "broken") && !broken && "scale-100 text-camp-moss",
                    broken && (chain === "ok" || chain === "broken") && "scale-100 text-danger-ink",
                )}
                style={{ transitionDelay: chain === "idle" ? undefined : `${sweepIndex * 30}ms`, transitionTimingFunction: "var(--ease-spring)" }}
            >
                <Link2 />
            </span>
        </>
    )

    const title = (
        <>
            <b className="font-medium text-foreground">{who.name}</b> {lines.verb}
            {lines.object ? (
                <>
                    {" "}
                    <b className="font-medium text-foreground">{lines.object}</b>
                </>
            ) : null}
            {who.drill ? (
                <>
                    {" "}
                    <span data-drill="" className="ml-0.5 inline-flex h-[18px] items-center rounded-[5px] bg-hover px-1.5 align-[1px] text-3xs font-medium leading-none text-ink-2 ring-1 ring-inset ring-line">
                        Drill
                    </span>
                </>
            ) : null}
            <OutcomeTag outcome={lines.outcome} />
        </>
    )

    const toggle = () => setOpen(!open)
    return (
        <HubRow
            data-feed-row=""
            data-record-row=""
            density="feed"
            lead={lead}
            title={title}
            second={lines.why || null}
            meta={it.at ? formatListTimestamp(it.at) : undefined}
            className={cn(
                broken && "after:pointer-events-none after:absolute after:inset-y-2 after:left-0 after:w-0.5 after:rounded-full after:bg-destructive",
                separated && "before:pointer-events-none before:absolute before:left-14 before:right-4 before:top-0 before:h-px before:bg-line hover:before:opacity-0",
            )}
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
            {open ? <RecordEvidence item={it} started={started} /> : null}
            {evidence && !open ? (
                <ChevronDown aria-hidden className="absolute bottom-1.5 right-4 size-3.5 text-ink-4 opacity-0 transition-opacity group-hover/hubrow:opacity-100 group-focus-within/hubrow:opacity-100 [@media(hover:none)]:opacity-100" />
            ) : null}
        </HubRow>
    )
}

/** The evidence for one entry (AI15): a two-column grid on a sunken block. */
function RecordEvidence({ item: it, started }: { item: AIActivityItem; started: string }) {
    const [copied, setCopied] = React.useState(false)
    const copy = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const proof = { seq: it.seq, action: it.title, at: it.at, prev_hash: it.prev_hash, entry_hash: it.entry_hash, initiator: it.initiator }
        try {
            await navigator.clipboard.writeText(JSON.stringify(proof, null, 2))
            setCopied(true)
        } catch {
            setCopied(false)
        }
    }
    const rows: [string, React.ReactNode, boolean?][] = []
    if (it.seq) rows.push(["Entry", `#${it.seq}`])
    if (it.kind !== "agent_run" && it.title) rows.push(["Action", it.title, true])
    if (it.source) rows.push(["Source", sourceWords(it.source)])
    if (started)
        rows.push([
            "Started by",
            <span key="s" className={UNATTENDED_INITIATORS.has(it.initiator ?? "") ? "text-warning-ink" : undefined}>
                {started}
            </span>,
        ])
    rows.push(["Acted as", "you"])
    if (it.entry_hash) {
        rows.push(["Previous hash", shortHash(it.prev_hash) || "—", true])
        rows.push(["This hash", shortHash(it.entry_hash), true])
    }
    return (
        <div
            data-feed-evidence=""
            onClick={(e) => e.stopPropagation()}
            className="hub-pop relative z-[2] mb-1 mt-2.5 rounded-[10px] bg-sunken px-3 py-2.5 ring-1 ring-inset ring-line dark:bg-white/[0.025]"
        >
            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-1.5 text-meta">
                {rows.map(([k, v, mono]) => (
                    <React.Fragment key={k}>
                        <dt className="text-meta text-ink-3">{k}</dt>
                        <dd className={cn("min-w-0 truncate", mono ? "font-mono text-3xs tracking-normal text-ink-2" : "text-foreground")}>{v}</dd>
                    </React.Fragment>
                ))}
            </dl>
            {it.entry_hash ? (
                <button type="button" onClick={copy} className="mt-2 inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-2xs font-medium text-ink-2 hover:bg-hover hover:text-foreground [&_svg]:size-3.5">
                    <Copy aria-hidden />
                    {copied ? "Copied" : "Copy proof"}
                </button>
            ) : null}
        </div>
    )
}
