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

import React, { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/error/errorState"
import { Printer } from "@/lib/icons"
import EvidencePackView from "@/components/admin/EvidencePackView"
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

export default function EvidencePackPage() {
    const searchParams = useSearchParams()
    const [pack, setPack] = useState<EvidencePack | null>(null)
    const [failed, setFailed] = useState(false)

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

    if (failed) {
        return (
            <ErrorState
                errorTitle="Could not assemble the pack"
                errorMessage="The audit log could not be read for this window."
                onRetry={load}
            />
        )
    }

    return (
        <main id="main-content" className="h-full overflow-y-auto bg-background">
            {/* Not printed: it is the furniture around the document, not part of it. */}
            <div className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur print:hidden">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
                    <p className="text-sm font-medium">Evidence pack</p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => window.print()}
                        disabled={!pack}
                    >
                        <Printer className="h-4 w-4" />
                        Print or save as PDF
                    </Button>
                </div>
            </div>

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
