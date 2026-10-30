"use client"

import * as React from "react"
import Link from "next/link"
import { Virtuoso, VirtuosoGrid } from "react-virtuoso"

import { DocCard } from "@/components/doc/docCard"
import { DocRow } from "@/components/doc/docRows"
import { COLUMN, DocGridSkeleton, DocRowsSkeleton, GRID } from "@/components/doc/docSkeletons"
import { useCreateDoc } from "@/components/doc/useCreateDoc"
import { PagedListFooter } from "@/components/doc/usePagedList"
import { ArrowRight, Loader2, Plus } from "@/lib/icons"
import { SpotDocs, SpotInbox, SpotSearch, Tile } from "@/components/ui/graphics"
import { Button } from "@/components/ui/button"
import { busyWith } from "@/lib/ui/busyWith"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { QUICK_DOC_TEMPLATES, templateGlyph } from "@/lib/docTemplates"
import { cn } from "@/lib/utils/helpers/cn"
import type { DocTab } from "@/lib/utils/docTab"
import type { DocListItem } from "@/types/docGraph"
import { app_doc_path } from "@/types/paths"
import { areaHue } from "@/lib/areas"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

// The archive's rows load with the Archived tab: most visits never open it.
const RestoreRow = lazyPiece(() => import("@/components/doc/RestoreRow").then((m) => ({ default: m.RestoreRow })))

// The skeletons live in docSkeletons.tsx, light enough for the page to draw
// before this list's code is here; they stay importable from the list.
export { DocGridSkeleton, DocRowsSkeleton }

export type DocsView = "grid" | "list"

interface DocListResultProps {
    items: DocListItem[]
    view: DocsView
    tab: DocTab
    isLoading?: boolean
    /** The first page failed to load. */
    isError?: boolean
    onRetry?: () => void
    hasMore?: boolean
    onLoadMore?: () => void
    /** A later page failed to load. */
    moreFailed?: boolean
    onRetryMore?: () => void
    /** Lead with the new-doc card (the grid of Recent and Mine). */
    withCreateCard?: boolean
    /** A filter is narrowing the list, and how to take it off. */
    filtered?: boolean
    onClearFilters?: () => void
    /** Whether the viewer may change a doc: its menu then offers Rename and the trash. */
    canEdit?: (doc: DocListItem) => boolean
}

/** The empty list's words, for each tab: what goes there and how it gets there. */
const EMPTY: Record<DocTab, { title: string; description: string }> = {
    recent: { title: "Nothing opened yet", description: "Docs you open show up here, the last one first." },
    mine: { title: "Write the first doc", description: "Notes, plans and decisions live here, beside the chat that made them." },
    shared: { title: "Nothing shared with you yet", description: "Docs teammates share with you show up here." },
    workspace: { title: "No workspace docs yet", description: "A doc everyone in the workspace can open shows up here." },
    starred: { title: "No starred docs", description: "Star a doc from its ⋯ menu to keep it here and in the sidebar." },
    archived: { title: "Nothing archived", description: "Docs nobody has opened for a long time are archived here, and any of them can be brought back." },
}

export function DocListResult({
    items,
    view,
    tab,
    isLoading,
    isError,
    onRetry,
    hasMore,
    onLoadMore,
    moreFailed,
    onRetryMore,
    withCreateCard,
    filtered,
    onClearFilters,
    canEdit,
}: DocListResultProps) {
    const when = tab === "recent" ? "viewed" : "edited"
    const asRows = view === "list" || tab === "archived"

    // The entrance plays once, for the cards of the first page.
    const firstPage = React.useRef<number | null>(null)
    if (firstPage.current === null && items.length > 0) firstPage.current = items.length

    const data = React.useMemo(() => {
        const out: (DocListItem | "CREATE_CARD")[] = [...items]
        if (withCreateCard && !asRows) out.unshift("CREATE_CARD")
        return out
    }, [items, withCreateCard, asRows])

    if (isLoading && items.length === 0) return asRows ? <DocRowsSkeleton /> : <DocGridSkeleton withCreateCard={!!withCreateCard} />
    // An error is never shown as an empty list (I19).
    if (isError && items.length === 0) return <ErrorState subject="these docs" onRetry={onRetry} className="pt-10" />
    if (items.length === 0) {
        if (filtered) {
            return (
                <EmptyState
                    illustration={<SpotSearch />}
                    title="No docs match these filters"
                    className="pt-10"
                    action={onClearFilters && <Button variant="secondary" size="sm" onClick={onClearFilters}>Clear filters</Button>}
                />
            )
        }
        if (tab === "mine") return <DocsEmpty />
        if (tab === "workspace") return <DocsEmpty space="workspace" title={EMPTY.workspace.title} description={EMPTY.workspace.description} />
        return (
            <EmptyState
                illustration={tab === "shared" ? <SpotInbox hue={areaHue("docs")} /> : <SpotDocs hue={areaHue("docs")} />}
                title={EMPTY[tab].title}
                description={EMPTY[tab].description}
                className="pt-10"
            />
        )
    }

    const footer = () => <PagedListFooter what="docs" failed={!!moreFailed} loading={!!(hasMore || isLoading)} onRetry={() => onRetryMore?.()} />
    const more = () => {
        if (hasMore && !isLoading && !moreFailed) onLoadMore?.()
    }

    if (asRows) {
        return (
            <div className="min-h-0 w-full flex-1" data-doc-list="rows">
                <Virtuoso
                    style={{ height: "100%", width: "100%" }}
                    data={items}
                    endReached={more}
                    computeItemKey={(_, d) => d.doc_uuid}
                    components={{
                        Header: () => <div className="h-3 sm:h-4" />,
                        Footer: footer,
                    }}
                    itemContent={(_, d) => (
                        <div className={COLUMN}>
                            {tab === "archived" ? (
                                <React.Suspense fallback={<div className="h-14 sm:h-12" />}>
                                    <RestoreRow id={d.doc_uuid} title={d.doc_title} icon={d.doc_icon} at={d.doc_archived_at} verb="Archived" />
                                </React.Suspense>
                            ) : (
                                <DocRow doc={d} when={when} canEdit={canEdit?.(d) ?? false} />
                            )}
                        </div>
                    )}
                />
            </div>
        )
    }

    return (
        <div className="min-h-0 w-full flex-1" data-doc-list="grid">
            <VirtuosoGrid
                style={{ height: "100%", width: "100%" }}
                totalCount={data.length}
                data={data}
                endReached={more}
                listClassName={cn(GRID, COLUMN, "pb-8 pt-4 sm:pt-6")}
                components={{ Footer: footer }}
                itemContent={(index, item) => {
                    if (!item) return null
                    if (item === "CREATE_CARD") return <NewDocCard />
                    const docIndex = withCreateCard ? index - 1 : index
                    const animate = firstPage.current !== null && docIndex < Math.min(firstPage.current, 8)
                    return <DocCard doc={item} href={`${app_doc_path}/${item.doc_uuid}`} index={animate ? docIndex + 1 : undefined} when={when} canEdit={canEdit?.(item) ?? false} />
                }}
            />
        </div>
    )
}

/**
 * The first card (D03): a blank doc on the sunken ground with an inset line
 * (no dashed wireframe), then three templates as rows, each a tile in its own
 * hue: the list's only colour, and "All templates", the gallery's doc
 * templates (N38). A template's body is written by the server as the doc is
 * made (N37). A row busy making its doc shows a spinner and the rest wait. On
 * a phone it is a 56 px row with a brand + tile.
 */
export function NewDocCard() {
    const { create, busy } = useCreateDoc()
    return (
        <div
            data-new-doc-card=""
            className="flex flex-col rounded-xl bg-sunken ring-1 ring-inset ring-line-2 max-sm:h-14 max-sm:flex-row max-sm:items-center max-sm:bg-transparent max-sm:ring-0 sm:h-[264px] sm:p-3"
        >
            <button
                type="button"
                onClick={() => void create()}
                disabled={!!busy}
                className="group/blank flex flex-col items-center justify-center gap-1.5 rounded-lg text-ui font-medium text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 max-sm:w-full max-sm:flex-row max-sm:justify-start max-sm:gap-3 max-sm:px-1 max-sm:py-2 sm:h-[118px]"
            >
                <span className="relative max-sm:hidden" aria-hidden="true">
                    <span className="block h-[50px] w-10 rounded-md bg-sheet shadow-e1 transition-transform duration-[140ms] group-hover/blank:-translate-y-0.5 motion-reduce:transform-none" />
                    <span className="absolute -bottom-1.5 -right-2 inline-flex size-[18px] items-center justify-center rounded-[9px] bg-brand text-brand-foreground ring-2 ring-sunken">
                        {busy === "blank" ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    </span>
                </span>
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand text-brand-foreground sm:hidden" aria-hidden="true">
                    {busy === "blank" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                </span>
                <span className="sm:mt-1.5">Blank doc</span>
            </button>
            <div className="mt-1 flex flex-col max-sm:hidden">
                {QUICK_DOC_TEMPLATES.map((t) => {
                    const Glyph = templateGlyph(t.glyph)
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => void create({ templateId: t.id, title: t.name })}
                            disabled={!!busy}
                            data-template-row={t.id}
                            className="group/tpl flex h-8 items-center gap-2.5 rounded-lg px-2 text-ui-sm text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-60"
                        >
                            <Tile hue={t.hue} size="sm" className="size-4 rounded-[5px] transition-transform duration-[220ms] ease-[var(--ease-spring)] group-hover/tpl:scale-[1.06] motion-reduce:transform-none [&>svg]:size-2.5">
                                {busy === t.id ? <Loader2 className="animate-spin" /> : <Glyph />}
                            </Tile>
                            {t.name}
                        </button>
                    )
                })}
                <Link
                    href="/app/templates?kind=doc"
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-ui-sm font-medium text-brand-text outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
                >
                    All templates <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
            </div>
        </div>
    )
}

/** No docs here at all (D03): the spot, the line, three templates in a row and the one primary. */
function DocsEmpty({ space, title = EMPTY.mine.title, description = EMPTY.mine.description }: { space?: "workspace"; title?: string; description?: string }) {
    const { create, busy } = useCreateDoc()
    return (
        <div data-docs-empty="" className="mx-auto flex w-full max-w-[520px] flex-col items-center px-6 pt-12 text-center max-sm:min-h-[60dvh] max-sm:justify-center">
            <span data-empty-illustration="">
                <SpotDocs size={96} hue={areaHue("docs")} />
            </span>
            <h3 className="mt-4 text-heading text-ink">{title}</h3>
            <p className="mt-1 text-ui text-ink-2">{description}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
                {QUICK_DOC_TEMPLATES.map((t) => {
                    const Glyph = templateGlyph(t.glyph)
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => void create({ templateId: t.id, title: t.name, space })}
                            disabled={!!busy}
                            data-template-row={t.id}
                            className="inline-flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-ui-sm text-ink shadow-e1 outline-none transition-shadow hover:shadow-e2 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                        >
                            <Tile hue={t.hue} size="sm" className="size-4 rounded-[5px] [&>svg]:size-2.5">
                                {busy === t.id ? <Loader2 className="animate-spin" /> : <Glyph />}
                            </Tile>
                            {t.name}
                        </button>
                    )
                })}
            </div>
            <Button size="sm" className="mt-5 gap-1.5" onClick={() => void create({ space })} {...busyWith(busy, "blank")}>
                <Plus className="size-3.5" aria-hidden="true" /> {space === "workspace" ? "New workspace doc" : "New doc"}
            </Button>
        </div>
    )
}
