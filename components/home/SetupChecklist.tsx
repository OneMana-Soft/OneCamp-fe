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
 * ADMIN ONLY, and gated before the request rather than after it: the endpoint is
 * admin-only, so a member rendering this would fetch a 403 on every dashboard
 * load and log noise for something they were never shown.
 *
 * NO AI IMPORTS. This ships on both editions. The backend decides whether the
 * model-provider step exists at all, by asking the feature registry rather than
 * by importing anything.
 */

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Circle, ArrowRight, X } from "@/lib/icons"
import {
    getOnboardingStatus,
    dismissOnboarding,
    setStepSkipped,
    type OnboardingState,
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

interface Props {
    /** Rendered for nobody else; see the note above. */
    isAdmin: boolean | undefined
}

export const SetupChecklist: React.FC<Props> = ({ isAdmin }) => {
    const [state, setState] = useState<OnboardingState | null>(null)
    // Hidden optimistically on dismiss so the card goes away on click rather than
    // after a round trip. The write is fire-and-forget precisely because it is
    // recoverable: if it fails the card returns on the next load, which is a far
    // better failure than a spinner on a dismiss button.
    const [hidden, setHidden] = useState(false)

    useEffect(() => {
        if (!isAdmin) return
        let cancelled = false
        getOnboardingStatus()
            .then((s) => {
                if (!cancelled) setState(s ?? null)
            })
            .catch(() => {
                // A dashboard must not fail because a setup hint could not load.
                if (!cancelled) setState(null)
            })
        return () => {
            cancelled = true
        }
    }, [isAdmin])

    const dismiss = useCallback(() => {
        setHidden(true)
        void dismissOnboarding().catch(() => {
            /* see the note on `hidden` */
        })
    }, [])

    // Set a step aside, or put it back.
    //
    // Re-read rather than patched locally: the counts and the ordering are the
    // backend's to decide, and a card that recomputed them here would be a second
    // implementation of the same rules waiting to disagree with the first.
    const toggleSkipped = useCallback((id: string, skipped: boolean) => {
        void setStepSkipped(id, skipped)
            .then(getOnboardingStatus)
            .then((s) => setState(s ?? null))
            .catch(() => {
                /* the list is re-derived on the next load anyway */
            })
    }, [])

    const [showSkipped, setShowSkipped] = useState(false)

    // Checked on the client rather than server-side so the endpoint stays a plain
    // description of the workspace rather than a rendering decision.
    if (!shouldShowChecklist(isAdmin, hidden, state)) return null

    return (
        <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Finish setting up your workspace</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {state.done} of {state.total} done. This disappears on its own.
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={dismiss}
                    aria-label="Hide the setup checklist"
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Plain rules rather than a progress bar: four rows do not need a
                second representation of the same number, and the count above
                already says it. */}
            <ul className="mt-4 flex flex-col divide-y divide-border/60">
                {state.steps.map((step) => (
                    <li key={step.id} hidden={step.skipped && !showSkipped}>
                        {step.skipped ? (
                            <div className="flex items-center gap-3 py-2.5">
                                <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                                    {step.title}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => toggleSkipped(step.id, false)}
                                >
                                    Put back
                                </Button>
                            </div>
                        ) : step.done ? (
                            <div className="flex items-center gap-3 py-2.5">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                                <span className="text-sm text-muted-foreground line-through">
                                    {step.title}
                                </span>
                            </div>
                        ) : (
                            <Link
                                href={step.href}
                                className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium">{step.title}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {step.detail}
                                    </span>
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 pointer-events-none transition-opacity group-hover:opacity-100" />
                            </Link>
                        )}
                        {/* OUTSIDE the Link, not inside it. A button nested in an
                            anchor is invalid, and the click would navigate as well
                            as set the step aside.

                            The label names no provider. It first read "Not coming
                            from Slack", which asked a team arriving from Jira the
                            wrong question about a step that covers them too. */}
                        {step.skippable && !step.skipped && !step.done && (
                            <div className="-mt-1 pb-2 pl-7">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => toggleSkipped(step.id, true)}
                                >
                                    Nothing to import
                                </Button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            {/* The way back. A list you can hide things from has to be a list you
                can get them back from, or "not now" is indistinguishable from
                losing the feature. */}
            {state.skipped > 0 && !showSkipped && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowSkipped(true)}
                >
                    {state.skipped} set aside. Show
                </Button>
            )}
        </Card>
    )
}

export default SetupChecklist
