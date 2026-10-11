"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "@/lib/icons";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DocListTabContent } from "@/components/doc/docListTabContent";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { DocInfoListInterfaceResp } from "@/types/doc";
import { defaultDocTab, isDocTab, type DocTab } from "@/lib/utils/docTab";
import { DocGridSkeleton } from "@/components/doc/docListResult";
import { UnderlineTabs } from "@/components/doc/underlineTabs";
import { useCreateDoc } from "@/components/doc/useCreateDoc";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import { sanitizeFilterQuery } from "@/lib/utils/sanitizeFilterQuery";
import { isTyping } from "@/lib/goKeys";
import { cn } from "@/lib/utils/helpers/cn";

const FIRST_PAGE = "?pageIndex=0&pageSize=20"

/**
 * The docs page (content.md D01): one 1,040 px column on the sheet. A title
 * row ("Docs", a count, a search pill with its "/" key and the primary "New
 * doc" with "N"), then the tabs with the sliding ink underline, then the
 * cards. Three bands stacked over the content became one header.
 *
 * "All" and "Shared" need a list the API doesn't have (only Private and
 * Public), so the page keeps those two tabs with the v3 look. On a phone the
 * title is the app bar's and search is a full-width field under the tabs.
 */
export function DocListTabs() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const router = useRouter()
    const { create, busy } = useCreateDoc()

    const [urlTab] = useState(() => searchParams.get("tab"))
    const [selectedTab, setSelectedTab] = useState<DocTab>(() => defaultDocTab(urlTab, undefined))
    const [chosen, setChosen] = useState(isDocTab(urlTab))

    // The same first pages the two lists ask for, so SWR serves both from one
    // request each: the counts beside the tabs, and the default tab.
    const { data: firstPrivate } = useFetch<DocInfoListInterfaceResp>(`${GetEndpointUrl.GetUserPrivateDocList}${FIRST_PAGE}`)
    const { data: firstPublic } = useFetch<DocInfoListInterfaceResp>(`${GetEndpointUrl.GetUserPublicDocList}${FIRST_PAGE}`)
    const privateCount = firstPrivate?.data ? firstPrivate.data.count ?? firstPrivate.data.docs?.length ?? 0 : undefined
    const publicCount = firstPublic?.data ? firstPublic.data.count ?? firstPublic.data.docs?.length ?? 0 : undefined

    useEffect(() => {
        if (chosen || !firstPrivate) return
        setSelectedTab(defaultDocTab(null, (firstPrivate.data?.docs ?? []).length))
        setChosen(true)
    }, [chosen, firstPrivate])

    const handleTabChange = useCallback((value: string) => {
        if (isDocTab(value)) {
            setChosen(true)
            setSelectedTab(value)
        }
    }, [])

    useEffect(() => {
        if (!chosen) return
        if (pathname === "/app/doc" && searchParams.get("tab") !== selectedTab) {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", selectedTab)
            router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [chosen, selectedTab, pathname, router, searchParams])

    // Search: typed into the pill, asked for after 500 ms and three letters.
    const [inputValue, setInputValue] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const debouncedSearch = useMemo(() => debounceUtil((q: string) => setSearchQuery(q.trim()), 500), [])
    const onSearch = useCallback((raw: string) => {
        const q = sanitizeFilterQuery(raw)
        setInputValue(q)
        debouncedSearch(q.trim().length >= 3 ? q : "")
    }, [debouncedSearch])
    const clearSearch = useCallback(() => {
        setInputValue("")
        setSearchQuery("")
        debouncedSearch("")
    }, [debouncedSearch])

    // "/" searches and "N" starts a doc, from anywhere on the page but a field.
    const searchRef = useRef<HTMLInputElement>(null)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return
            if (e.key === "/") {
                e.preventDefault()
                searchRef.current?.focus()
            } else if (e.key === "n" || e.key === "N") {
                e.preventDefault()
                void create()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [create])

    const total = (privateCount ?? 0) + (publicCount ?? 0)
    const tabs = [
        { value: "private", label: "Private", count: privateCount },
        { value: "public", label: "Public", count: publicCount },
    ]

    return (
        <div className="flex h-full min-h-0 flex-col" data-docs-page="">
            <div className="mx-auto w-full max-w-[1040px] shrink-0 px-4 sm:px-8 sm:pt-8">
                {/* The title row: on a phone the app bar carries the title. */}
                <div className="flex min-h-14 items-center gap-3 max-sm:hidden">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-title-1 text-ink">Docs</h1>
                        <p className="mt-0.5 text-ui text-ink-2 tabular-nums" aria-live="polite">
                            {privateCount === undefined || publicCount === undefined ? " " : `${total} ${total === 1 ? "doc" : "docs"} · ${publicCount} public`}
                        </p>
                    </div>
                    <SearchPill inputRef={searchRef} value={inputValue} onChange={onSearch} onClear={clearSearch} className="w-60" />
                    <Button size="sm" onClick={() => void create()} disabled={!!busy} className="gap-1.5" aria-keyshortcuts="N">
                        <Plus className="size-3.5" aria-hidden="true" />
                        New doc
                        <kbd className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-xs bg-white/20 px-1 text-micro font-medium" aria-hidden="true">N</kbd>
                    </Button>
                </div>
                <UnderlineTabs tabs={tabs} value={selectedTab} onValueChange={handleTabChange} label="Docs" className="mt-4 gap-5 max-sm:mt-0" />
                {/* A phone searches in a full-width field under the tabs. */}
                <div className="pt-3 sm:hidden">
                    <SearchPill value={inputValue} onChange={onSearch} onClear={clearSearch} className="h-11 w-full" />
                </div>
            </div>
            {chosen ? (
                <DocListTabContent selectedTab={selectedTab} searchQuery={searchQuery} onClearSearch={clearSearch} />
            ) : (
                <DocGridSkeleton withCreateCard />
            )}
        </div>
    )
}

/** The 32 px search pill (e1, r8) with its "/" key; 44 px full width on a phone. */
function SearchPill({
    value,
    onChange,
    onClear,
    className,
    inputRef,
}: {
    value: string
    onChange: (v: string) => void
    onClear: () => void
    className?: string
    inputRef?: React.Ref<HTMLInputElement>
}) {
    return (
        <label className={cn("group/search relative flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-ink-3 shadow-e1 focus-within:ring-1 focus-within:ring-brand/50", className)}>
            <Search className="size-3.5 shrink-0" aria-hidden="true" />
            <input
                ref={inputRef}
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        onClear();
                        (e.target as HTMLInputElement).blur()
                    }
                }}
                placeholder="Search docs"
                aria-label="Search docs"
                className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3 max-sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
            />
            {value ? (
                <button type="button" onClick={onClear} aria-label="Clear search" className="inline-flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink max-sm:size-8">
                    <X className="size-3.5" />
                </button>
            ) : (
                <kbd className="kbd max-sm:hidden" aria-hidden="true">/</kbd>
            )}
        </label>
    )
}
