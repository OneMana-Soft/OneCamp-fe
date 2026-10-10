"use client"

/**
 * The evidence pack as its own page.
 *
 * A ROUTE RATHER THAN A DIALOG, for three reasons that all come from what this
 * document is for. It gets printed, and a modal prints its scroll container
 * rather than its contents. It gets sent to somebody — "the pack for Q3 is at
 * this address" — which needs an address. And it is long, so it needs the whole
 * window rather than a box inside one.
 *
 * Admin-only by position: app/app/admin/layout.tsx refuses anyone else before
 * this renders, so the gate is not repeated here where it could drift.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { ChevronLeft, Printer } from "@/lib/icons"
import EvidencePackView from "@/components/admin/EvidencePackView"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"
import { usePlan } from "@/hooks/usePlan"
import { getEvidencePack, downloadEvidencePack, type EvidencePack } from "@/services/settingsService"

/**
 * The window, from the address bar.
 *
 * Both optional and both passed straight through, because the server owns the
 * default (the last 90 days) and the bounds. Parsing them here would be a second
 * opinion about the window, and the document would then be a reading of a pack
 * built for different dates than the one its fingerprint covers.
 */
function windowFromQuery(params: URLSearchParams): { from?: Date; to?: Date } {
    const parse = (raw: string | null): Date | undefined => {
        if (!raw) return undefined
        const d = new Date(raw)
        return Number.isNaN(d.getTime()) ? undefined : d
    }
    return { from: parse(params.get("from")), to: parse(params.get("to")) }
}

/** Where the pack is opened from, and where its way back leads. (Not exported: a page may only export what Next reads.) */
const AUDIT_LOG_HREF = "/app/admin?tab=audit"

/**
 * The bar above the document in every state: the way back to the audit log,
 * the page's name, and what this state offers. The page had no way back at
 * all, and it opens full-window, so an admin reached Admin again only through
 * the browser's Back or the sidebar. Not printed: it is the furniture around
 * the document, not part of it.
 */
function PackBar({ children }: { children?: ReactNode }) {
    return (
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background print:hidden">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                    <Link
                        href={AUDIT_LOG_HREF}
                        className="inline-flex shrink-0 items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        Audit log
                    </Link>
                    <span aria-hidden="true" className="text-muted-foreground">
                        /
                    </span>
                    <span aria-current="page" className="truncate font-medium">
                        Evidence pack
                    </span>
                </nav>
                {children}
            </div>
        </div>
    )
}

export default function EvidencePackPage() {
    const searchParams = useSearchParams()
    const [pack, setPack] = useState<EvidencePack | null>(null)
    const [failed, setFailed] = useState(false)
    // A company control: on the free plan the server refuses the pack, so the
    // page says why instead of reporting a failure.
    const plan = usePlan()
    const locked = plan.isLocked("audit_export")

    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const load = useCallback(() => {
        setFailed(false)
        setPack(null)
        const w = windowFromQuery(new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }))
        getEvidencePack(w.from, w.to)
            .then((p) => setPack(p))
            .catch(() => setFailed(true))
    }, [from, to])

    useEffect(load, [load])

    const download = useCallback(() => {
        const w = windowFromQuery(new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }))
        void downloadEvidencePack(w.from, w.to)
    }, [from, to])

    if (locked) {
        return (
            <main id="main-content" className="h-full overflow-y-auto bg-background">
                <PackBar />
                <div className="mx-auto max-w-4xl px-4 py-8">
                    <PlanLockedNotice what="The evidence pack" upgradeUrl={plan.upgradeUrl} />
                </div>
            </main>
        )
    }

    if (failed) {
        // In the page's frame, with its way back: it was the old full-page
        // error with no bar and no way out but Try again.
        return (
            <main id="main-content" className="h-full overflow-y-auto bg-background">
                <PackBar />
                <div className="mx-auto max-w-4xl px-4 py-8">
                    <ErrorState
                        subject="the evidence pack"
                        detail="The audit log couldn't be read for this window."
                        onRetry={load}
                    />
                </div>
            </main>
        )
    }

    return (
        <main id="main-content" className="h-full overflow-y-auto bg-background">
            <PackBar>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0 gap-2 md:h-8"
                    onClick={() => window.print()}
                    disabled={!pack}
                >
                    <Printer />
                    Print or save as PDF
                </Button>
            </PackBar>

            {pack ? (
                <EvidencePackView pack={pack} onDownload={download} />
            ) : (
                <div role="status" aria-label="Assembling the evidence pack" className="mx-auto max-w-4xl space-y-3 px-4 py-8">
                    <Skeleton className="h-7 w-2/3 rounded" />
                    <Skeleton className="h-4 w-1/2 rounded" />
                    <Skeleton className="h-28 w-full rounded" />
                    <Skeleton className="h-52 w-full rounded" />
                </div>
            )}
        </main>
    )
}
