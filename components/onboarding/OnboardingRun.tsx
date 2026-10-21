"use client"

/**
 * OnboardingRun: the guided first run of a new workspace (design-15,
 * basecamp-44; design/platform/ONBOARDING_ANALYSIS.md).
 *
 * WHY. The setup checklist (components/home/SetupChecklist) sends an admin
 * away to an admin screen for each step and leaves them to find their way
 * back. This walks them through the same steps in one place: invite people,
 * bring their work over, and open a worked sample project.
 *
 * NO SECOND COPY. The steps are the checklist's own, derived by the server
 * (GET /admin/onboarding): the run holds no list of what is done. Each step
 * is the existing piece, in place: the invite form (components/invite), the
 * import card (Admin › Import) and the built-in client project template, which
 * the server applies to make the sample. A dialog on a computer, the shared
 * sheet on a phone (ResponsiveDialog), with its actions in the pinned footer.
 */

import React, { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { useSheetMode } from "@/components/ui/overlayMode"
import { InviteForm } from "@/components/invite/InviteForm"
import { CheckCircle2, Circle } from "@/lib/icons"
import { SegmentedProgress } from "@/components/ui/graphics/SegmentedProgress"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { OnboardingState } from "@/services/onboardingService"
import { makeSampleProject, removeSampleProject, type OnboardingSample } from "@/services/onboardingSampleService"

// The import card is Admin › Import's own, loaded only when its step opens.
const ImportCard = dynamic(() => import("@/components/admin/ImportCard"), { ssr: false })

/** The run's steps, in order, and the checklist step each one answers. */
export const RUN_STEPS = [
    { key: "people", title: "Invite your team", checklist: "people" },
    { key: "import", title: "Bring your work over", checklist: "import" },
    { key: "sample", title: "Open a sample project", checklist: "" },
    { key: "done", title: "You're set up", checklist: "" },
] as const
export type RunStepKey = (typeof RUN_STEPS)[number]["key"]

/** Whether a run step is already done, by the server's own checklist. Pure. */
export function runStepDone(key: RunStepKey, state: OnboardingState | null): boolean {
    if (key === "sample") return Boolean(state?.sample)
    const step = RUN_STEPS.find((s) => s.key === key)
    if (!step?.checklist) return false
    return Boolean(state?.steps.find((s) => s.id === step.checklist)?.done)
}

/** Where the sample project opens. Pure. */
export const sampleHref = (s: OnboardingSample) => `/app/project/${encodeURIComponent(s.project_uuid)}`

interface Props {
    state: OnboardingState | null
    /** Reads the checklist again, after a step changed the workspace. */
    refresh: () => void
    onClose: () => void
}

export default function OnboardingRun({ state, refresh, onClose }: Props) {
    const [at, setAt] = useState(0)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    // Invitations sent in this run: until then, moving on is a quiet "Skip for
    // now", so the step has one primary action, the form's own Send.
    const [invited, setInvited] = useState(false)
    // The invite form's actions go in this footer (InviteForm footerTo), so its
    // Send stays in view like every overlay's action.
    const [inviteFooter, setInviteFooter] = useState<HTMLElement | null>(null)
    // An import was made from the import step's card.
    const [importStarted, setImportStarted] = useState(false)
    // On a phone the run is a sheet, whose footer makes its own buttons 44px
    // tall; the invite form's sit one box down, so they are told the same here
    // (a landscape phone too, which the footer CSS's width query misses).
    const sheet = useSheetMode()
    const step = RUN_STEPS[at]
    const last = at === RUN_STEPS.length - 1
    const sample = state?.sample

    const next = () => {
        setError("")
        if (last) onClose()
        else setAt((i) => i + 1)
    }
    const back = () => {
        setError("")
        setAt((i) => Math.max(0, i - 1))
    }

    const runSample = async (make: boolean) => {
        setBusy(true)
        setError("")
        try {
            if (make) await makeSampleProject()
            else await removeSampleProject()
            refresh()
        } catch (e) {
            setError(apiErrorMessage(e, make ? "Couldn't make the sample project. Try again." : "Couldn't remove the sample project. Try again."))
        } finally {
            setBusy(false)
        }
    }

    const footer = (
        <>
            {at > 0 && !last && (
                <Button variant="ghost" onClick={back}>
                    Back
                </Button>
            )}
            {step.key === "people" ? (
                <>
                    {!invited && (
                        <Button variant="ghost" onClick={next}>
                            {runStepDone("people", state) ? "Next" : "Skip for now"}
                        </Button>
                    )}
                    {/* The invite form's Send, and after it Invite more and Next. */}
                    <div ref={setInviteFooter} data-invite-actions="" className={sheet ? "contents [&_button]:h-11" : "contents"} />
                </>
            ) : step.key === "sample" && !sample ? (
                <>
                    <Button variant="ghost" onClick={next} disabled={busy}>
                        Skip for now
                    </Button>
                    <Button onClick={() => void runSample(true)} disabled={busy} aria-busy={busy || undefined}>
                        {busy ? "Making it…" : "Make the sample project"}
                    </Button>
                </>
            ) : step.key === "import" && !importStarted && !runStepDone("import", state) ? (
                // The tiles are the step's job: a quiet skip until an import has started.
                <Button variant="ghost" onClick={next}>
                    Skip for now
                </Button>
            ) : (
                <Button onClick={next} disabled={busy}>
                    {last ? "Done" : "Next"}
                </Button>
            )}
        </>
    )

    return (
        <ResponsiveDialog title={step.title} description={`Step ${at + 1} of ${RUN_STEPS.length}`} footer={footer} onClose={onClose} wide>
            <div className="mb-4">
                <SegmentedProgress done={at + 1} total={RUN_STEPS.length} label={`Step ${at + 1} of ${RUN_STEPS.length}: ${step.title}`} />
            </div>

            {step.key === "people" && (
                <div data-run-step="people">
                    <InviteForm
                        asAdmin
                        again
                        noCancel
                        footerTo={inviteFooter}
                        doneLabel="Next"
                        onCreated={() => {
                            setInvited(true)
                            refresh()
                        }}
                        onClose={next}
                        header={({ summary }) => (
                            <p className="mb-3 text-balance text-ui text-ink-2">
                                {summary || "Add their addresses. Each gets an email with a link to join, good for seven days. Up to 25 people is free."}
                            </p>
                        )}
                    />
                </div>
            )}

            {step.key === "import" && (
                <div data-run-step="import" className="text-ui">
                    <p className="mb-3 text-balance text-ink-2">Bring projects, tasks and people from the tool you use now. It&apos;s also in Admin › Import.</p>
                    <ImportCard
                        firstRun
                        onStarted={() => {
                            setImportStarted(true)
                            refresh()
                        }}
                    />
                </div>
            )}

            {step.key === "sample" && (
                <div data-run-step="sample" className="flex flex-col gap-3 text-ui">
                    <p className="text-balance text-ink-2">
                        A worked client project shows how the pieces fit: dated tasks from kickoff to invoice, a client review step and a box for the client&apos;s sign-off.
                        Remove it in one step when you&apos;re done looking.
                    </p>
                    {sample ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-3" data-sample-made="">
                            <CheckCircle2 aria-hidden="true" className="size-4 text-success-ink" />
                            {/* A row of its own on a phone, so the buttons sit under it rather than squeeze it. */}
                            <span className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] sm:basis-auto">Your sample project is ready.</span>
                            <Button asChild size="sm" variant="outline" className="h-11 md:h-8">
                                <Link href={sampleHref(sample)} onClick={onClose}>
                                    Open it
                                </Link>
                            </Button>
                            <Button variant="ghost" size="sm" className="h-11 md:h-8" disabled={busy} onClick={() => void runSample(false)}>
                                Remove the sample
                            </Button>
                        </div>
                    ) : null}
                    {error && (
                        <p role="alert" className="text-meta font-medium text-danger-ink">
                            {error}
                        </p>
                    )}
                </div>
            )}

            {step.key === "done" && (
                <div data-run-step="done" className="flex flex-col gap-2 text-ui">
                    {RUN_STEPS.slice(0, -1).map((s) => (
                        <p key={s.key} className="flex items-center gap-2">
                            {runStepDone(s.key, state) ? (
                                <CheckCircle2 aria-hidden="true" className="size-4 text-success-ink" />
                            ) : (
                                <Circle aria-hidden="true" className="size-4 text-ink-3" />
                            )}
                            {s.title}
                        </p>
                    ))}
                    <p className="mt-2 text-balance text-ink-2">Anything left stays on Home, under Finish setting up your workspace.</p>
                </div>
            )}
        </ResponsiveDialog>
    )
}
