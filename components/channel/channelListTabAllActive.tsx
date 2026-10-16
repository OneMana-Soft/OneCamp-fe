"use client"

import { useEffect, useMemo, useState } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChannelInfoInterface } from "@/types/channel"
import { ChannelListResult } from "@/components/channel/chnnelListResult"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotSearch, SpotWelcome } from "@/components/ui/graphics/spots"
import { LocalizedErrorBoundary } from "@/components/error/LocalizedErrorBoundary"
import { ChannelListSkeleton, ChannelListState } from "@/components/channel/channelListFrame"
import { ErrorState } from "@/components/ui/error-state"

/** How many channels a page of Discover holds. */
export const DISCOVER_PAGE_SIZE = 20

interface DiscoverPage {
    channels_list: ChannelInfoInterface[]
    pageCount: number
    has_more: boolean
}

/** The address of a page of Discover, for what is typed. */
export function discoverURL(search: string, pageIndex: number): string {
    const q = search.trim()
    return `${GetEndpointUrl.GetDiscoverChannelList}?pageIndex=${pageIndex}&pageSize=${DISCOVER_PAGE_SIZE}${q ? `&search=${encodeURIComponent(q)}` : ""}`
}

/**
 * The rows of the pages in order, each channel once: a channel made between
 * two pages moves the rest along by one, and the last of a page would show
 * again at the top of the next.
 */
function eachChannelOnce(pages: readonly (readonly ChannelInfoInterface[] | undefined)[]): ChannelInfoInterface[] {
    const seen = new Set<string>()
    const out: ChannelInfoInterface[] = []
    for (const page of pages) {
        for (const c of page ?? []) {
            if (seen.has(c.ch_uuid)) continue
            seen.add(c.ch_uuid)
            out.push(c)
        }
    }
    return out
}

/** Whether two pages hold the same channels, in the same order, by the same names. */
function sameChannels(a: readonly ChannelInfoInterface[] | undefined, b: readonly ChannelInfoInterface[]): boolean {
    if (!a || a.length !== b.length) return false
    return a.every((c, i) => c.ch_uuid === b[i].ch_uuid && c.ch_name === b[i].ch_name)
}

/**
 * Discover: the public channels you could join and aren't in, by name, a
 * page at a time, and searched on the server (/ch/discover). It read one page
 * of 20 channels in graph order, yours among them, and searched only that
 * page: past 20 channels the rest never showed, and typing their names found
 * nothing.
 */
export const ChannelListTabAllActive = ({ searchQuery }: { searchQuery: string }) => {
    const q = searchQuery.trim()
    // The page asked for, for the query it was asked for: a new query starts
    // from its first page, and so does going back to an earlier one, whose
    // later pages are no longer shown.
    const [cursor, setCursor] = useState({ q, page: 0 })
    if (cursor.q !== q) setCursor({ q, page: 0 })
    const page = cursor.q === q ? cursor.page : 0
    const { data, isLoading, isError, mutate } = useFetch<DiscoverPage>(discoverURL(q, page))

    // The pages shown so far for this query, each in its place: a page asked
    // again (SWR revalidates the open one on focus) replaces itself rather
    // than repeating its rows.
    const [shown, setShown] = useState<{ q: string; pages: ChannelInfoInterface[][]; hasMore: boolean }>({ q: "", pages: [], hasMore: false })
    // An answer that shows nothing new leaves the state as it is: a new object
    // with the same rows (a revalidation, or a cache that hands out copies)
    // set it again every time, and each render set it once more, for ever.
    useEffect(() => {
        if (!data) return
        setShown((s) => {
            const rows = data.channels_list ?? []
            const hasMore = !!data.has_more
            if (s.q === q && s.pages.length === page + 1 && s.hasMore === hasMore && sameChannels(s.pages[page], rows)) return s
            const pages = s.q === q ? s.pages.slice(0, page) : []
            pages[page] = rows
            return { q, pages, hasMore }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])
    const rows = useMemo(() => (shown.q === q ? eachChannelOnce(shown.pages) : []), [shown, q])
    const hasMore = shown.q === q && shown.hasMore
    const onLoadMore = () => {
        if (!isLoading && hasMore) setCursor({ q, page: page + 1 })
    }
    const searching = q.length > 0

    // The frame the other tabs draw in (channelListFrame).
    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col overflow-hidden">
                <LocalizedErrorBoundary fallbackTitle="Couldn't show the channels" fallbackDescription="We couldn't load the list of channels you could join.">
                    {rows.length > 0 ? (
                        <ChannelListResult channelList={rows} onLoadMore={onLoadMore} hasMore={hasMore} isLoading={isLoading} />
                    ) : isLoading ? (
                        <ChannelListSkeleton />
                    ) : isError ? (
                        <ChannelListState>
                            <ErrorState subject="the channels you could join" onRetry={() => void mutate()} />
                        </ChannelListState>
                    ) : (
                        <ChannelListState>
                            <EmptyState
                                illustration={searching ? <SpotSearch /> : <SpotWelcome />}
                                title={searching ? "No channels match" : "All caught up!"}
                                description={searching
                                    ? `No channel you could join has “${q}” in its name.`
                                    : "You're in every public channel. New ones will show here once they're made."}
                            />
                        </ChannelListState>
                    )}
                </LocalizedErrorBoundary>
            </div>
        </div>
    )
}
