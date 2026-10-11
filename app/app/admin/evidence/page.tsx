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
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotDocs } from "@/components/ui/graphics"
import { PageFrame, PageFrameHeader } from "@/components/ui/settingsPage"
import { FileCheck2, Printer } from "@/lib/icons"
import { SETTINGS_PLACES } from "@/lib/adminSections"
import EvidencePackView from "@/components/admin/EvidencePackView"
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
 * The frame around the document in every state (design v3, A12): the page
 * frame's header with its breadcrumb (Audit log / Evidence pack), the
 * Records hue tile, and Print as the one action. The page opens from the
 * settings nav (Records, Evidence pack) and from the audit log, so the
 * breadcrumb is its way back. Not printed: it is furniture, not the document.
 */
function PackFrame({ children, action }: { children: ReactNode; action?: ReactNode }) {
    const place = SETTINGS_PLACES.find((p) => p.key === "evidence")
    return (
        <main id="main-content" className="h-full overflow-y-auto bg-background">
            <PageFrame className="print:max-w-none print:p-0">
                <PageFrameHeader
                    hue={place?.hue ?? "lake"}
                    icon={place?.icon ?? FileCheck2}
                    title="Evidence pack"
                    description={place?.description ?? "A record of the log an auditor can check for themselves."}
                    breadcrumb={[{ label: "Audit log", href: AUDIT_LOG_HREF }, { label: "Evidence pack" }]}
                    actions={action}
                    className="ev-print-hide"
                />
                {children}
            </PageFrame>
        </main>
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

    useEffect(() => {
        if (!locked) load()
    }, [load, locked])

    const download = useCallback(() => {
        const w = windowFromQuery(new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }))
        void downloadEvidencePack(w.from, w.to)
    }, [from, to])

    if (locked) {
        // The 96px page spot, what a licence brings, and the way to one.
        return (
            <PackFrame>
                <EmptyState
                    tone="accent"
                    headingLevel={2}
                    illustration={<SpotDocs />}
                    title="Evidence packs come with a licence"
                    description="A pack is the log with its chain recomputed and every section fingerprinted, a document an auditor can check for themselves. The free plan keeps the log and Verify."
                    action={
                        plan.upgradeUrl ? (
                            <Button asChild size="sm">
                                <a href={plan.upgradeUrl} target="_blank" rel="noopener noreferrer">
                                    See the licence
                                </a>
                            </Button>
                        ) : undefined
                    }
                />
            </PackFrame>
        )
    }

    if (failed) {
        return (
            <PackFrame>
                <ErrorState subject="the evidence pack" detail="The audit log couldn't be read for this window." onRetry={load} />
            </PackFrame>
        )
    }

    return (
        <PackFrame
            action={
                <Button variant="secondary" size="sm" className="h-11 md:h-7" onClick={() => window.print()} disabled={!pack}>
                    <Printer aria-hidden="true" />
                    Print or save as PDF
                </Button>
            }
        >
            {pack ? (
                <EvidencePackView pack={pack} onDownload={download} />
            ) : (
                <div role="status" aria-label="Assembling the evidence pack" className="mx-auto max-w-[720px] space-y-3">
                    <Skeleton className="h-4 w-40 rounded" />
                    <Skeleton className="h-9 w-2/3 rounded" />
                    <Skeleton className="h-16 w-full rounded" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-52 w-full rounded" />
                </div>
            )}
        </PackFrame>
    )
}
