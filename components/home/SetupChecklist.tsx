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
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Circle, X, CheckCircle2, Users, Sparkles, Mail, Globe, Shield, Download } from "@/lib/icons"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { SegmentedProgress } from "@/components/ui/graphics/SegmentedProgress"
import { celebrate } from "@/lib/celebrateSoon"
import { cn } from "@/lib/utils/helpers/cn"
import { CHECKLIST_MEMO_KEY, ChecklistPlaceholder, holdChecklistPlace, readMemo, WELL, type Memo } from "@/components/home/setupChecklistPlace"
// What Home and the tests read from here, defined beside the place Home holds.
export { adminFromSidenav, CHECKLIST_MEMO_KEY, holdChecklistPlace } from "@/components/home/setupChecklistPlace"
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

function writeMemo(v: "open" | "closed") {
    try {
        localStorage.setItem(CHECKLIST_MEMO_KEY, v)
    } catch {
        /* nothing to remember it in: the card loads unheld next time */
    }
}

// The guided first run (components/onboarding/OnboardingRun), loaded when it opens.
const OnboardingRun = dynamic(() => import("@/components/onboarding/OnboardingRun"), { ssr: false })

/** Set once this browser has opened the guided run on its own. */
export const FIRST_RUN_KEY = "oc_first_run_shown"

/**
 * Whether the guided run opens on its own: once per browser, for an admin
 * whose checklist still has work on it. Pure but for storage.
 */
export function shouldAutoOpenRun(state: OnboardingState | null, isAdmin: boolean | undefined): boolean {
    if (!shouldShowChecklist(isAdmin, false, state)) return false
    try {
        return localStorage.getItem(FIRST_RUN_KEY) !== "1"
    } catch {
        return false
    }
}

function markRunShown() {
    try {
        localStorage.setItem(FIRST_RUN_KEY, "1")
    } catch {
        // Private mode: it may open again next visit, which is harmless.
    }
}

/** How long "Hidden. Undo" stays before the server is told. */
export const UNDO_HIDE_MS = 6_000
/** Open steps listed before "Show N more". */
const FIRST_STEPS = 6

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
    // The guided run over the same steps.
    const [running, setRunning] = useState(false)
    const reload = useCallback(() => {
        void getOnboardingStatus()
            .then((s) => s && setState(s))
            .catch(() => {})
    }, [])

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
                if (shouldAutoOpenRun(s ?? null, true)) {
                    markRunShown()
                    setRunning(true)
                }
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
            <div role="status" className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-sunken px-4 text-ui text-ink-2">
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

    // Design v3 (hub.md H6): the demo guide's well and step cards, up to six
    // steps in a 3 x 2 grid, and a segmented progress in place of the ring.
    return (
        <section role="region" aria-labelledby="setup-checklist-title" className={WELL} data-setup-checklist="">
            <div className="flex flex-wrap items-center gap-3 px-1 pb-3.5">
                <h2 id="setup-checklist-title" className="text-heading font-semibold">Finish setting up your workspace</h2>
                <SegmentedProgress done={state.done} total={state.total} />
                <span className="text-meta tabular-nums text-ink-3">
                    {state.done} of {state.total} done. This disappears on its own.
                </span>
                <span className="flex-1" />
                <Button variant="outline" size="sm" className="h-11 md:h-8" onClick={() => setRunning(true)} data-open-run="">
                    Set up with a guide
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    className="relative shrink-0 text-ink-3 after:absolute after:-inset-2 hover:text-foreground"
                    onClick={hideCard}
                    aria-label="Hide the setup checklist"
                >
                    <X className="size-3.5" />
                </Button>
            </div>

            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
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
                        <li key={step.id} className="flex min-h-[132px] flex-col gap-2.5 rounded-lg p-3.5 ring-1 ring-inset ring-line">
                            <StepTile id={step.id} quiet />
                            <span className="min-w-0 flex-1 text-ui text-ink-3">{step.title}</span>
                            <Button variant="ghost" size="xs" className="self-start" onClick={() => toggleSkipped(step.id, false)}>
                                Put back
                            </Button>
                        </li>
                    ))}
            </ul>

            {running && <OnboardingRun state={state} refresh={reload} onClose={() => { setRunning(false); reload() }} />}

            {skipFailed && (
                <p role="alert" className="mt-2 px-1 text-meta font-medium text-danger-ink">
                    Couldn&apos;t set that step aside. Try again.
                </p>
            )}

            {(more > 0 || (skippedSteps.length > 0 && !showSkipped)) && (
                <div className="mt-2 flex flex-wrap gap-x-2 px-1">
                    {more > 0 && (
                        <Button variant="ghost" size="xs" onClick={() => setShowAll(true)}>
                            Show {more} more
                        </Button>
                    )}
                    {/* The way back. A list you can hide things from has to be a
                        list you can get them back from, or "not now" is
                        indistinguishable from losing the feature. */}
                    {skippedSteps.length > 0 && !showSkipped && (
                        <Button variant="ghost" size="xs" onClick={() => setShowSkipped(true)}>
                            Show {skippedSteps.length} set aside
                        </Button>
                    )}
                </div>
            )}
        </section>
    )
}


/** Each step's tile, by what it is about (hub.md H6). */
const STEP_TILES: Record<string, { tone: string; Icon: React.ComponentType<{ className?: string }> }> = {
    invite: { tone: "bg-camp-sky-tint text-camp-sky", Icon: Users },
    ai: { tone: "bg-agent-muted text-agent", Icon: Sparkles },
    model: { tone: "bg-agent-muted text-agent", Icon: Sparkles },
    email: { tone: "bg-camp-sun-tint text-camp-sun", Icon: Mail },
    domain: { tone: "bg-camp-lake-tint text-camp-lake", Icon: Globe },
    sso: { tone: "bg-camp-dusk-tint text-camp-dusk", Icon: Shield },
    import: { tone: "bg-camp-moss-tint text-camp-moss", Icon: Download },
}

function StepTile({ id, quiet = false }: { id: string; quiet?: boolean }) {
    const key = Object.keys(STEP_TILES).find((k) => id.toLowerCase().includes(k))
    const t = key ? STEP_TILES[key] : { tone: "bg-camp-sky-tint text-camp-sky", Icon: Circle }
    return (
        <span aria-hidden="true" className={cn("grid size-8 shrink-0 place-items-center rounded-[9px] [&_svg]:size-[18px]", quiet ? "bg-hover text-ink-3" : t.tone)}>
            <t.Icon />
        </span>
    )
}

/** One open step as a card: the link to it, and beside it (not inside it) setting it aside. */
function StepRow({ step, isNext, onSkip }: { step: OnboardingStep; isNext: boolean; onSkip: () => void }) {
    return (
        <li
            className={cn(
                "group relative flex min-h-[132px] flex-col gap-2.5 rounded-lg bg-sheet p-3.5 transition-[box-shadow,translate] duration-[140ms] ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand hover:-translate-y-px hover:shadow-e2 dark:bg-[#18191C]",
                isNext ? "shadow-e2" : "shadow-e1",
            )}
            data-setup-step={step.id}
            data-next={isNext ? "" : undefined}
        >
            <span className="flex items-start justify-between">
                <StepTile id={step.id} />
                <span
                    aria-hidden="true"
                    className={cn("size-5 rounded-full", isNext ? "ring-[1.5px] ring-inset ring-brand" : "ring-[1.5px] ring-inset ring-line-3")}
                />
            </span>
            {/* The whole card is the link: an overlay stretched from the title. */}
            <Link href={step.href} className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
                <span className="block text-ui font-medium">{step.title}</span>
                <span className="mt-0.5 block text-meta text-ink-3">{step.detail}</span>
                {isNext ? (
                    <span className="mt-2 block text-ui-sm font-medium text-brand-text">
                        <span>Start</span> →
                    </span>
                ) : null}
            </Link>
            {/* OUTSIDE the Link, not inside it. A button nested in an anchor is
                invalid, and the click would navigate as well as set the step
                aside. The label names no provider: "Not coming from Slack"
                asked a team arriving from Jira the wrong question. */}
            {step.skippable && (
                <Button variant="ghost" size="xs" className="relative z-[1] mt-auto self-start" onClick={onSkip}>
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
        <section role="region" aria-labelledby="setup-checklist-done" className={WELL}>
            <div className="flex items-start gap-3">
                <span ref={ringRef} className="-mt-0.5 shrink-0">
                    <ProgressRing value={100} label="Every step done" size={24}>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </ProgressRing>
                </span>
                <div className="min-w-0 flex-1">
                    <h2 id="setup-checklist-done" className="text-sm font-semibold">Your workspace is set up</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Everything on the checklist is done, so this card won&apos;t come back.</p>
                </div>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 shrink-0 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground" onClick={onClose} aria-label="Close">
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </section>
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
