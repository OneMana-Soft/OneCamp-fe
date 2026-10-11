
import {DocInfoInterface} from "@/types/doc";
import {DocCard} from "@/components/doc/docCard";
import * as React from "react";
import Link from "next/link";
import {app_doc_path} from "@/types/paths";
import { ArrowRight, CheckSquare, FileText, ListTodo, Loader2, Plus } from "@/lib/icons";
import { SpotDocs, SpotSearch, Tile } from "@/components/ui/graphics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/helpers/cn";
import { VirtuosoGrid } from 'react-virtuoso';
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DOC_TEMPLATES, type DocTemplate } from "@/lib/docTemplates";
import { useCreateDoc } from "@/components/doc/useCreateDoc";

const TEMPLATE_ICON: Record<DocTemplate["id"], React.ReactNode> = {
    "meeting-notes": <ListTodo />,
    "project-brief": <FileText />,
    "decision-record": <CheckSquare />,
}

/** The docs grid (D01): cards of at least 232 px, 16 px apart, 24 px between rows; one column of rows on a phone. */
const GRID = "grid w-full grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-y-6"

export const DocListResult = ({docList, onLoadMore, hasMore, isLoading, isError, onRetry, withCreateCard, searchQuery, onClearSearch}: {docList: DocInfoInterface[], onLoadMore?: ()=>void, hasMore?: boolean, isLoading?: boolean, /** The first page failed to load. */ isError?: boolean, onRetry?: () => void, /** Lead with the new-doc card (not while searching). */ withCreateCard?: boolean, /** What the list was searched for, if it was. */ searchQuery?: string, onClearSearch?: () => void}) => {

    const data = React.useMemo(() => {
        const items: (DocInfoInterface | 'CREATE_CARD')[] = [...docList];
        if (withCreateCard) items.unshift('CREATE_CARD');
        return items;
    }, [docList, withCreateCard]);

    // The entrance plays once, for the cards of the first page.
    const firstPage = React.useRef<number | null>(null)
    if (firstPage.current === null && docList.length > 0) firstPage.current = docList.length

    if (isLoading && docList.length === 0) {
        return <DocGridSkeleton withCreateCard={!!withCreateCard} />;
    }

    if (isError && docList.length === 0) {
        return <ErrorState subject="these docs" onRetry={onRetry} className="pt-10" />;
    }

    if (docList.length === 0 && !isLoading) {
        const query = searchQuery?.trim()
        if (query) {
            return (
                <EmptyState
                    illustration={<SpotSearch />}
                    title={`No docs match “${query}”`}
                    className="pt-10"
                    action={onClearSearch && (
                        <Button variant="secondary" size="sm" onClick={onClearSearch}>Clear search</Button>
                    )}
                />
            )
        }
        return <DocsEmpty />
    }

    return (
        <div className="w-full flex-1 min-h-0">
             <VirtuosoGrid
                style={{ height: '100%', width: '100%' }}
                totalCount={data.length}
                data={data}
                endReached={() => {
                     if (hasMore && !isLoading && onLoadMore) onLoadMore();
                }}
                listClassName={cn(GRID, "mx-auto max-w-[1040px] px-4 pb-8 pt-4 sm:px-8 sm:pt-6")}
                components={{
                    Footer: () => (
                        <div className="flex justify-center py-4 w-full">
                            {isLoading && (
                                <span className="flex items-center gap-2 text-ui-sm text-ink-3" role="status">
                                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                                    Loading…
                                </span>
                            )}
                        </div>
                    )
                }}
                itemContent={(index, item) => {
                     if (!item) return null;
                     if (item === 'CREATE_CARD') return <NewDocCard />
                     const docIndex = withCreateCard ? index - 1 : index
                     const animate = firstPage.current !== null && docIndex < Math.min(firstPage.current, 8)
                     return <DocCard doc={item} href={`${app_doc_path}/${item.doc_uuid}`} index={animate ? docIndex + 1 : undefined} />
                }}
             />
        </div>
    )
}

/**
 * The first card (D03): a blank doc on the sunken ground with an inset line
 * (no dashed wireframe), then three templates as rows, each a tile in its own
 * hue: the list's only colour. A row busy making its doc shows a spinner and
 * the rest wait. On a phone it is a 56 px row with a brand + tile.
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
                    <span className="block h-[50px] w-10 rounded-md bg-sheet shadow-e1 transition-transform duration-[140ms] group-hover/blank:-translate-y-0.5" />
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
                {DOC_TEMPLATES.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => void create(t)}
                        disabled={!!busy}
                        data-template-row={t.id}
                        className="group/tpl flex h-8 items-center gap-2.5 rounded-lg px-2 text-ui-sm text-ink-2 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-60"
                    >
                        <Tile hue={t.hue} size="sm" className="size-4 rounded-[5px] transition-transform duration-[220ms] ease-[var(--ease-spring)] group-hover/tpl:scale-[1.06] [&>svg]:size-2.5">
                            {busy === t.id ? <Loader2 className="animate-spin" /> : TEMPLATE_ICON[t.id]}
                        </Tile>
                        {t.name}
                    </button>
                ))}
                <Link
                    href="/app/templates"
                    className="flex h-8 items-center gap-1 rounded-lg px-2 text-ui-sm font-medium text-brand-text outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
                >
                    All templates <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
            </div>
        </div>
    )
}

/** No docs at all (D03): the spot, the line, the three templates in a row and the one primary. */
function DocsEmpty() {
    const { create, busy } = useCreateDoc()
    return (
        <div data-docs-empty="" className="mx-auto flex w-full max-w-[520px] flex-col items-center px-6 pt-12 text-center max-sm:min-h-[60dvh] max-sm:justify-center">
            <span data-empty-illustration="">
                <SpotDocs size={96} hue="sky" />
            </span>
            <h3 className="mt-4 text-heading text-ink">Write the first doc</h3>
            <p className="mt-1 text-ui text-ink-2">Notes, plans and decisions live here, beside the chat that made them.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
                {DOC_TEMPLATES.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => void create(t)}
                        disabled={!!busy}
                        data-template-row={t.id}
                        className="inline-flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-ui-sm text-ink shadow-e1 outline-none transition-shadow hover:shadow-e2 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
                    >
                        <Tile hue={t.hue} size="sm" className="size-4 rounded-[5px] [&>svg]:size-2.5">
                            {busy === t.id ? <Loader2 className="animate-spin" /> : TEMPLATE_ICON[t.id]}
                        </Tile>
                        {t.name}
                    </button>
                ))}
            </div>
            <Button size="sm" className="mt-5 gap-1.5" onClick={() => void create()} disabled={!!busy}>
                <Plus className="size-3.5" aria-hidden="true" /> New doc
            </Button>
        </div>
    )
}

/** The list's own cards while the first page loads: the same grid, the same card shape. */
export function DocGridSkeleton({ withCreateCard }: { withCreateCard: boolean }) {
    return (
        <div role="status" aria-label="Loading docs" className="w-full flex-1 min-h-0" data-doc-skeleton="">
            <div className={cn(GRID, "mx-auto max-w-[1040px] px-4 pt-4 sm:px-8 sm:pt-6")} aria-hidden="true">
                {Array.from({ length: withCreateCard ? 4 : 3 }).map((_, i) => (
                    withCreateCard && i === 0 ? (
                        <div key={i} className="rounded-xl bg-sunken ring-1 ring-inset ring-line-2 max-sm:h-14 sm:h-[264px]" />
                    ) : (
                        <div key={i} className="flex overflow-hidden max-sm:h-16 max-sm:items-center max-sm:gap-3 sm:h-[264px] sm:flex-col sm:rounded-xl sm:bg-raised sm:shadow-e1">
                            <div className="shrink-0 bg-sunken max-sm:h-[52px] max-sm:w-10 max-sm:rounded-md sm:h-44 sm:px-4 sm:pt-4">
                                <div className="h-full rounded-t-md bg-sheet p-4 max-sm:hidden">
                                    <Skeleton className="h-1.5 w-11/12" />
                                    <Skeleton className="mt-2 h-1.5 w-4/5" />
                                    <Skeleton className="mt-2 h-1.5 w-3/5" />
                                </div>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:justify-between sm:px-3.5 sm:py-3">
                                <Skeleton className="h-3.5 w-3/5" />
                                <div className="flex items-center gap-1.5">
                                    <Skeleton className="size-5 rounded-[10px] max-sm:hidden" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    )
}
