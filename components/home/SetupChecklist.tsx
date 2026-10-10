"use client"

/**
 * SetupChecklist — what this workspace still needs, on the first screen an admin sees.
 *
 * WHY IT EXISTS. Setup ended at "create an admin account" and redirected here.
 * A buyer who had just stood up a fifteen-service stack landed on an empty
 * dashboard: no channel, no teammates, no prompt, no next step. Boards, tables,
 * search across their own connected systems, the calendar, agents — all reachable
 * only by someone who already knew they were there. Breadth is the reason for the
 * price and an empty room communicates the opposite.
 *
 * IT DISAPPEARS ON ITS OWN. Every step is derived by the backend from the live
 * workspace, so the card vanishes when the work is actually done rather than when
 * somebody ticks a box. Dismissing is for the admin who does not want it in the
 * meantime.
 *
 * SHORT, WITH THE NEXT STEP OBVIOUS. It lists the open steps only, three at a
 * time in the server's order (the rest one click away), and marks the first
 * "Start". The count above says how much is done.
 *
 * ADMIN ONLY, and gated before the request rather than after it: the endpoint is
 * admin-only, so a member rendering this would fetch a 403 on every dashboard
 * load and log noise for something they were never shown.
 *
 * NO AI IMPORTS. This ships on both editions. The backend decides whether the
 * model-provider step exists at all, by asking the feature registry rather than
 * by importing anything.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Circle, ArrowRight, X, CheckCircle2 } from "@/lib/icons"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { celebrate } from "@/lib/celebrate"
import {
    getOnboardingStatus,
    dismissOnboarding,
    setStepSkipped,
    type OnboardingState,
    type OnboardingStep,
} from "@/services/onboardingService"

/**
 * Whether the card has anything to say. Pulled out of the component because it is
 * the whole behaviour worth testing: every branch here is a reason a real admin
 * would or would not see setup on their dashboard, and testing it through a
 * rendered tree would test React instead.
 */
// A type predicate rather than a plain boolean, so the caller gets `state`
// narrowed to non-null from the same check that decides whether to render. The
// alternative is a second null test next to this one, which is one more place for
// the two to disagree.
export function shouldShowChecklist(
    isAdmin: boolean | undefined,
    hidden: boolean,
    state: OnboardingState | null,
): state is OnboardingState {
    if (!isAdmin) return false
    if (hidden) return false
    if (!state) return false
    if (state.dismissed) return false
    // Nothing left to do, or a build where every step was filtered out.
    if (state.complete || state.total === 0) return false
    return true
}

/**
 * What this browser last knew of the card: "open" when it had steps to show,
 * "closed" once it was finished or hidden. It decides whether Home holds the
 * card's place while the card loads, so a finished workspace never reserves
 * space for a card that won't come, and an unfinished one doesn't jump when it
 * does.
 */
export const CHECKLIST_MEMO_KEY = "oc_setup_checklist"
type Memo = "open" | "closed" | null

function readMemo(): Memo {
    try {
        const v = localStorage.getItem(CHECKLIST_MEMO_KEY)
        return v === "open" || v === "closed" ? v : null
    } catch {
        return null
    }
}

function writeMemo(v: "open" | "closed") {
    try {
        localStorage.setItem(CHECKLIST_MEMO_KEY, v)
    } catch {
        /* nothing to remember it in: the card loads unheld next time */
    }
}

/**
 * Whether the signed-in person is an admin, from the side-nav answer: unknown
 * (undefined) until it arrives, then yes or no. The server leaves
 * user_is_admin out when it is false (omitempty), so reading the field alone
 * kept a member "unknown" for good, and a browser that had shown the card
 * held its place as a skeleton on Home forever. A failed answer is a no: the
 * card is a hint, never worth a skeleton. Pure.
 */
export function adminFromSidenav(res: { data?: { data?: { user_is_admin?: boolean } }; error?: unknown }): boolean | undefined {
    if (res.data) return res.data.data?.user_is_admin === true
    return res.error ? false : undefined
}

/** Whether to hold the card's place while its state loads. Pure. */
export function holdChecklistPlace(isAdmin: boolean | undefined, loaded: boolean, memo: Memo): boolean {
    if (loaded || isAdmin === false || memo === "closed") return false
    // Before we know who this is, hold it only where this browser has shown it.
    if (isAdmin === undefined) return memo === "open"
    return true
}

/** How long "Hidden. Undo" stays before the server is told. */
export const UNDO_HIDE_MS = 6_000
/** Open steps listed before "Show N more". */
const FIRST_STEPS = 3

interface Props {
    /** Rendered for nobody else; see the note above. */
    isAdmin: boolean | undefined
}

const SetupChecklist: React.FC<Props> = ({ isAdmin }) => {
    const [state, setState] = useState<OnboardingState | null>(null)
    // The state as last rendered, for putting a step back if setting it aside fails.
    const shown = useRef<OnboardingState | null>(null)
    useEffect(() => {
        shown.current = state
    })
    const [loaded, setLoaded] = useState(false)
    // Read before the first paint, so a finished workspace never flashes the
    // placeholder.
    const [memo, setMemo] = useState<Memo>(null)
    useLayoutEffect(() => setMemo(readMemo()), [])

    // "pending": hidden on the click, with Undo, and the server not yet told.
    // "hidden": told. The one line stays where the card was for the rest of
    // the visit, so Home does not jump a second time.
    const [hide, setHide] = useState<"no" | "pending" | "hidden">("no")
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [showAll, setShowAll] = useState(false)
    const [showSkipped, setShowSkipped] = useState(false)
    const [skipFailed, setSkipFailed] = useState(false)
    // The checklist was just finished, while this browser was following it.
    const [finished, setFinished] = useState(false)

    useEffect(() => {
        if (!isAdmin) return
        let cancelled = false
        getOnboardingStatus()
            .then((s) => {
                if (cancelled) return
                // The last step was done since this browser last showed the
                // card: the one moment worth a celebration. A workspace that
                // was finished long ago loads quietly ("closed").
                if (s && !s.dismissed && s.complete && s.total > 0 && readMemo() === "open") setFinished(true)
                setState(s ?? null)
                setLoaded(true)
                if (s) writeMemo(shouldShowChecklist(true, false, s) ? "open" : "closed")
            })
            .catch(() => {
                // A dashboard must not fail because a setup hint could not load.
                if (!cancelled) setLoaded(true)
            })
        return () => {
            cancelled = true
        }
    }, [isAdmin])

    const sendDismissal = useCallback(() => {
        writeMemo("closed")
        // Fire and forget: if it fails, the card returns on the next load,
        // which is a far better failure than a spinner on a dismiss button.
        void dismissOnboarding().catch(() => {})
    }, [])

    const hideCard = useCallback(() => {
        setHide("pending")
        hideTimer.current = setTimeout(() => {
            hideTimer.current = null
            setHide("hidden")
            sendDismissal()
        }, UNDO_HIDE_MS)
    }, [sendDismissal])

    const undoHide = useCallback(() => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = null
        setHide("no")
    }, [])

    // Leaving Home inside the moment to undo still hides it, as asked.
    useEffect(
        () => () => {
            if (hideTimer.current) {
                clearTimeout(hideTimer.current)
                hideTimer.current = null
                sendDismissal()
            }
        },
        [sendDismissal],
    )

    // Set a step aside, or put it back: at once on screen, then the server's
    // own counts. A failure puts it back where it was and says so.
    const toggleSkipped = useCallback((id: string, skipped: boolean) => {
        setSkipFailed(false)
        const before = shown.current
        if (before) setState(withSkipped(before, id, skipped))
        void setStepSkipped(id, skipped)
            .then(getOnboardingStatus)
            .then((s) => {
                if (!s) return
                if (s.complete && s.total > 0 && !before?.complete) {
                    setFinished(true)
                    writeMemo("closed")
                }
                setState(s)
            })
            .catch(() => {
                setState(before)
                setSkipFailed(true)
            })
    }, [])

    if (hide !== "no" && isAdmin) {
        return (
            <div role="status" className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border/60 px-4 text-sm text-muted-foreground">
                Setup checklist hidden.
                {hide === "pending" && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={undoHide}>
                        Undo
                    </Button>
                )}
            </div>
        )
    }

    if (!loaded) {
        if (!holdChecklistPlace(isAdmin, loaded, memo)) return null
        return <ChecklistPlaceholder />
    }

    if (finished && isAdmin) return <ChecklistDone onClose={() => setFinished(false)} />

    // Checked on the client rather than server-side so the endpoint stays a plain
    // description of the workspace rather than a rendering decision.
    if (!shouldShowChecklist(isAdmin, false, state)) return null

    const open = state.steps.filter((s) => !s.done && !s.skipped)
    const listed = showAll ? open : open.slice(0, FIRST_STEPS)
    const more = open.length - listed.length
    const skippedSteps = state.steps.filter((s) => s.skipped)
    // The one step to do now: the first open one. It says "Start" in words, so
    // a new admin is never left choosing between equal rows.
    const nextId = open[0]?.id

    return (
        <Card role="region" aria-labelledby="setup-checklist-title" className="p-5">
            {/* The heading sits beside how far along the setup is, a ring in
                the place Home's other cards keep their tile. */}
            <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <ProgressRing
                        value={state.total > 0 ? (state.done / state.total) * 100 : 0}
                        label={`${state.done} of ${state.total} steps done`}
                        className="shrink-0"
                    />
                    <div className="min-w-0">
                        <h2 id="setup-checklist-title" className="text-sm font-semibold">Finish setting up your workspace</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {state.done} of {state.total} done. This disappears on its own.
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={hideCard}
                    aria-label="Hide the setup checklist"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <ul className="mt-3 flex flex-col divide-y divide-border/60">
                {listed.map((step) => (
                    <StepRow
                        key={step.id}
                        step={step}
                        isNext={step.id === nextId}
                        onSkip={() => toggleSkipped(step.id, true)}
                    />
                ))}
                {showSkipped &&
                    skippedSteps.map((step) => (
                        <li key={step.id} className="flex min-h-12 items-center gap-3 py-1.5">
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                            <span className="min-w-0 flex-1 text-sm text-muted-foreground">{step.title}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => toggleSkipped(step.id, false)}
                            >
                                Put back
                            </Button>
                        </li>
                    ))}
            </ul>

            {skipFailed && (
                <p role="alert" className="mt-2 text-xs font-medium text-danger-ink">
                    Couldn&apos;t set that step aside. Try again.
                </p>
            )}

            {(more > 0 || (skippedSteps.length > 0 && !showSkipped)) && (
                <div className="mt-1 flex flex-wrap gap-x-2">
                    {more > 0 && (
                        <Button variant="ghost" size="sm" className="h-8 px-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowAll(true)}>
                            Show {more} more
                        </Button>
                    )}
                    {/* The way back. A list you can hide things from has to be a
                        list you can get them back from, or "not now" is
                        indistinguishable from losing the feature. */}
                    {skippedSteps.length > 0 && !showSkipped && (
                        <Button variant="ghost" size="sm" className="h-8 px-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowSkipped(true)}>
                            Show {skippedSteps.length} set aside
                        </Button>
                    )}
                </div>
            )}
        </Card>
    )
}

/** One open step: the link to it, and beside it (not inside it) setting it aside. */
function StepRow({ step, isNext, onSkip }: { step: OnboardingStep; isNext: boolean; onSkip: () => void }) {
    return (
        <li className="flex items-center gap-2">
            <Link
                href={step.href}
                className="group -mx-2 flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{step.title}</span>
                    <span className="block text-xs text-muted-foreground">{step.detail}</span>
                </span>
                {isNext ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-text">
                        Start
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                ) : (
                    <ArrowRight aria-hidden="true" className="pointer-events-none h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
            </Link>
            {/* OUTSIDE the Link, not inside it. A button nested in an anchor is
                invalid, and the click would navigate as well as set the step
                aside. The label names no provider: "Not coming from Slack"
                asked a team arriving from Jira the wrong question. */}
            {step.skippable && (
                <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs text-muted-foreground hover:text-foreground" onClick={onSkip}>
                    Nothing to import
                </Button>
            )}
        </li>
    )
}

/**
 * The checklist, finished: said once, with the ring full and a burst of camp
 * sparks from it (nothing under reduced motion). Closing it, or the next
 * visit, leaves Home without it.
 */
function ChecklistDone({ onClose }: { onClose: () => void }) {
    const ringRef = useRef<HTMLSpanElement>(null)
    const fired = useRef(false)
    useEffect(() => {
        if (fired.current) return
        fired.current = true
        celebrate(ringRef.current)
    }, [])
    return (
        <Card role="region" aria-labelledby="setup-checklist-done" className="p-5">
            <div className="flex items-start gap-3">
                <span ref={ringRef} className="shrink-0">
                    <ProgressRing value={100} label="Every step done">
                        <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </ProgressRing>
                </span>
                <div className="min-w-0 flex-1">
                    <h2 id="setup-checklist-done" className="text-sm font-semibold">Your workspace is set up</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Everything on the checklist is done, so this card won&apos;t come back.</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </Card>
    )
}

/** The card's shape while it loads: its header and three step rows. */
function ChecklistPlaceholder() {
    return (
        <Card role="status" aria-label="Loading the setup checklist" aria-busy="true" className="p-5">
            <div aria-hidden="true">
                <div className="flex items-start gap-3">
                    <Skeleton variant="circle" className="size-8 shrink-0" />
                    <div className="grid gap-1.5 pt-0.5">
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-3 w-44" />
                    </div>
                </div>
                <div className="mt-3 divide-y divide-border/60">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex min-h-12 items-center gap-3 py-1.5">
                            <Skeleton variant="circle" className="h-4 w-4 shrink-0" />
                            <div className="grid flex-1 gap-1.5">
                                <Skeleton className={i === 1 ? "h-3.5 w-1/2" : "h-3.5 w-2/5"} />
                                <Skeleton className="h-3 w-3/5" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    )
}

/** The state with one step set aside or put back, counted as the server counts it. Pure. */
export function withSkipped(s: OnboardingState, id: string, skipped: boolean): OnboardingState {
    const target = s.steps.find((x) => x.id === id)
    if (!target || !!target.skipped === skipped || target.done) return s
    const delta = skipped ? 1 : -1
    const total = s.total - delta
    return {
        ...s,
        steps: s.steps.map((x) => (x.id === id ? { ...x, skipped } : x)),
        total,
        skipped: s.skipped + delta,
        complete: total > 0 && s.done >= total,
    }
}

export default SetupChecklist
