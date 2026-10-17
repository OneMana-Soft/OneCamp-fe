"use client"

import { useState } from "react"

import { DocListTab, type DocListQuery } from "@/components/doc/DocListTab"
import type { DocsView } from "@/components/doc/docListResult"
import { DOC_TABS, tabTools, type DocTab } from "@/lib/utils/docTab"
import { cn } from "@/lib/utils/helpers/cn"

/** The part of the page's sort and filters a tab's list takes (lib/utils/docTab). Pure. */
function queryFor(tab: DocTab, q: DocListQuery): DocListQuery {
    const tools = tabTools(tab)
    return { sort: tools.sort ? q.sort : undefined, owner: tools.owner ? q.owner : undefined, space: tools.space ? q.space : undefined }
}

const keyOf = (tab: DocTab, q: DocListQuery) => `${tab}|${q.sort ?? ""}|${q.owner ?? ""}|${q.space ?? ""}`

/**
 * The docs home's lists. A tab, once opened, stays mounted (hidden while
 * another shows), so switching back shows its docs where they were instead of
 * remounting it: that flashed the skeleton and put the list back at the top.
 * A tab not yet opened isn't mounted, so it asks for nothing. A tab keeps the
 * sort and filters it was last shown with until it is shown again; a change
 * starts its list from the first page.
 */
export function DocListTabContent({
    tab,
    query,
    view,
    selfId,
    onCount,
    onClearFilters,
}: {
    tab: DocTab
    query: DocListQuery
    view: DocsView
    selfId?: string
    onCount?: (tab: DocTab, count: number | undefined) => void
    onClearFilters?: () => void
}) {
    const [shown, setShown] = useState<Partial<Record<DocTab, DocListQuery>>>(() => ({ [tab]: queryFor(tab, query) }))
    const now = queryFor(tab, query)
    if (keyOf(tab, shown[tab] ?? {}) !== keyOf(tab, now) || !shown[tab]) setShown({ ...shown, [tab]: now })

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {DOC_TABS.filter((t) => shown[t]).map((t) => {
                const q = shown[t]!
                return (
                    <div key={t} data-doc-tab={t} className={cn("min-h-0 flex-1 flex-col overflow-hidden", t === tab ? "flex" : "hidden")}>
                        <DocListTab key={keyOf(t, q)} tab={t} query={q} view={view} selfId={selfId} onCount={onCount} onClearFilters={onClearFilters} />
                    </div>
                )
            })}
        </div>
    )
}
