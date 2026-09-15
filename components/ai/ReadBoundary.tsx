"use client"

/**
 * ReadBoundary — the line a recap prints about how far it was allowed to look.
 *
 * WHY THIS EXISTS
 * ---------------
 * Catch me up is the surface people actually use, and the surface a short demo
 * actually reaches. It was also the one place the product's whole argument went
 * unsaid: the retrieval behind it has always been filtered to the reader's own
 * memberships, but the recap arrived looking like an assistant that had read the
 * workspace. A buyer could finish an evaluation having seen the AI be useful and
 * never once seen it be bounded, which is the opposite of what OneCamp sells.
 *
 * So the recap now states its own boundary, every time, next to the answer it
 * produced. Not a badge and not a banner — one quiet line under the text, with a
 * way through to the place that proves it.
 *
 * WHAT IT WILL NOT SAY
 * --------------------
 * It reports what WAS opened and never what was not. The count of channels a
 * member cannot see is itself something a non-member should not learn, and a
 * line reading "4 channels were not read" would leak the existence of every
 * private room in the workspace to anyone who pressed a button.
 *
 * It also says nothing at all when the server did not send a count. An older
 * backend omits the field, and inventing a boundary for a recap whose limits we
 * do not actually know would be the one failure this component exists to
 * prevent.
 */

import React from "react"
import Link from "next/link"
import { ShieldCheck } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { CatchUpScope } from "@/services/catchUpService"

/** Where a reader goes to watch the rule be enforced on their own account. */
export const GOVERNANCE_HREF = "/app/settings/agents"

/**
 * boundaryText renders the count as the sentence a reader gets.
 *
 * Exported and pure so the wording is tested directly rather than through two
 * components that each render it.
 */
export function boundaryText(scope: CatchUpScope, scopesAllowed?: number): string {
    if (!scopesAllowed || scopesAllowed < 1) return ""
    if (scope !== "workspace") return "Read this conversation only."
    if (scopesAllowed === 1) return "Read the one conversation you are a member of."
    return `Read the ${scopesAllowed} conversations you are a member of.`
}

export const ReadBoundary: React.FC<{
    scope: CatchUpScope
    scopesAllowed?: number
    className?: string
}> = ({ scope, scopesAllowed, className }) => {
    const text = boundaryText(scope, scopesAllowed)
    if (!text) return null

    return (
        <p
            className={cn(
                "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground",
                className,
            )}
        >
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>{text} Nothing outside that was opened.</span>
            <Link
                href={GOVERNANCE_HREF}
                className="underline underline-offset-2 hover:text-foreground focus-visible:text-foreground"
            >
                See how that is enforced
            </Link>
        </p>
    )
}

export default ReadBoundary
