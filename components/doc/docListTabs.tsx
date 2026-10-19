"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PanelLeft, Search, Trash2, X } from "@/lib/icons";
import { isComposingKey } from "@/lib/keys/ime";
import { DocListTabContent } from "@/components/doc/docListTabContent";
import { DocGridSkeleton, DocRowsSkeleton, type DocsView } from "@/components/doc/docListResult";
import { DocsToolbar, type OwnerChoice } from "@/components/doc/DocsToolbar";
import { NewDocButton } from "@/components/doc/NewDocButton";
import { tabPageKey } from "@/components/doc/DocListTab";
import { UnderlineTabs } from "@/components/doc/underlineTabs";
import { useCreateDoc } from "@/components/doc/useCreateDoc";
import { PhoneBarActions } from "@/components/navigationBar/mobile/phoneBarActions";
import { useSidenav } from "@/hooks/useHydrateUserSidebar";
import { useFetch } from "@/hooks/useFetch";
import { useStoredState } from "@/hooks/useStoredState";
import { useDebounce } from "@/hooks/useDebounce";
import { OWN_ERRORS } from "@/lib/axiosInstance";
import { isTyping } from "@/lib/goKeys";
import { DOC_TABS, DOC_TAB_LABEL, defaultDocTab, isDocTab, tabFromAddress, tabTools, tabToolsOff, type DocTab } from "@/lib/utils/docTab";
import { cn } from "@/lib/utils/helpers/cn";
import { DocGraphEndpoint, listKey, type Envelope } from "@/services/docGraphService";
import { searchable } from "@/services/docHomeService";
import type { DocList, DocListSort, DocSpace, DocTrash } from "@/types/docGraph";

const PagesSheet = React.lazy(() => import("@/components/docTree/PagesSheet"));
// Search's results load with the first search (I20): the page opens without them.
const DocSearchResults = React.lazy(() => import("@/components/doc/DocSearchResults").then((m) => ({ default: m.DocSearchResults })));

const isView = (v: unknown): v is DocsView => v === "grid" || v === "list";

const quiet = { revalidateOnFocus: false };

/** What a search can be narrowed by: whose docs. It has its own order (best first) and shows rows. */
const SEARCH_TOOLS = { sort: false, owner: true, space: false, view: false };

/** Each tab's whole count, for the label beside it, and the trash's: asked once the page has settled. */
function useTabCounts(enabled: boolean) {
    const ask = (tab: DocTab) => (enabled ? listKey(tab, { limit: 1 }) : "");
    // One hook per tab, always in DOC_TABS' order.
    const answers = [
        useFetch<Envelope<DocList>>(ask("recent"), undefined, quiet, OWN_ERRORS).data,
        useFetch<Envelope<DocList>>(ask("mine"), undefined, quiet, OWN_ERRORS).data,
        useFetch<Envelope<DocList>>(ask("shared"), undefined, quiet, OWN_ERRORS).data,
        useFetch<Envelope<DocList>>(ask("workspace"), undefined, quiet, OWN_ERRORS).data,
        useFetch<Envelope<DocList>>(ask("starred"), undefined, quiet, OWN_ERRORS).data,
        useFetch<Envelope<DocList>>(ask("archived"), undefined, quiet, OWN_ERRORS).data,
    ];
    const trash = useFetch<Envelope<DocTrash>>(enabled ? `${DocGraphEndpoint.Trash}?limit=1` : "", undefined, quiet, OWN_ERRORS).data;
    const counts: Partial<Record<DocTab, number>> = {};
    DOC_TABS.forEach((t, i) => {
        const n = answers[i]?.data?.count;
        if (typeof n === "number") counts[t] = n;
    });
    return { counts, trash: trash?.data?.count };
}

/**
 * The docs home (docs programme B5, structure.md P0.6; content.md D01): one
 * 1,040 px column on the sheet. A title row (Docs, how many, a search pill
 * with its "/" key, and New doc with its "N" and its other ways to start), the
 * tabs (Recent, Mine, Shared with me, Workspace, Starred, Archived) each with
 * its exact count and the Trash at their end, the list's sort, filters and
 * cards-or-rows, then the list. Searching shows docs whose title or body has
 * the words, with the passages found, from every list: no tab is chosen while
 * it shows, and the one filter it takes (whose docs) stays in view, so a
 * filter set on another list never narrows it unseen. On a phone the title is the app bar's,
 * search is a full-width field under the tabs, and the app bar gains Pages:
 * the sidebar's page tree, in a sheet.
 */
export function DocListTabs() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { create, busy } = useCreateDoc();
    const selfId = useSidenav().data?.data?.user_uuid;

    const [urlTab] = React.useState(() => searchParams.get("tab"));
    const [tab, setTab] = React.useState<DocTab>(() => tabFromAddress(urlTab) ?? "recent");
    // A doc made from the Workspace tab is the workspace's (QA DSA-34); from
    // any other tab, private.
    const newDocSpace: DocSpace | undefined = tab === "workspace" ? "workspace" : undefined;
    const [chosen, setChosen] = React.useState(() => tabFromAddress(urlTab) !== null);

    // Without a tab in the address, Recent opens, or the workspace's docs for
    // someone who hasn't opened one yet. Recent's first page decides: the
    // same answer its list then shows, so nothing is asked twice.
    const recentFirst = useFetch<Envelope<DocList>>(chosen ? "" : tabPageKey("recent", {}), undefined, quiet, OWN_ERRORS);
    React.useEffect(() => {
        if (chosen) return;
        if (recentFirst.data) {
            setTab(defaultDocTab(null, recentFirst.data.data?.count ?? 0));
            setChosen(true);
        } else if (recentFirst.isError) {
            // Recent's own list says it failed, with Try again.
            setChosen(true);
        }
    }, [chosen, recentFirst.data, recentFirst.isError]);

    // Search: what's typed, asked for a moment after typing stops. It looks
    // through every doc the person can open, so while it shows, no tab is
    // chosen, and choosing one leaves the search for that list.
    const [text, setText] = React.useState("");
    const debounced = useDebounce(text, 250);
    const searching = searchable(debounced);
    const clearSearch = React.useCallback(() => setText(""), []);

    // A tab the person picks goes into the address, for Back and a reload.
    // The one the home picks for itself stays out of it: writing the address
    // is a navigation, and Next keeps only the latest, so written once
    // Recent's first page came, it cancelled a navigation the person had
    // already started (Undo right after a delete stayed here: N32).
    const onTab = React.useCallback((value: string) => {
        if (!isDocTab(value)) return;
        setChosen(true);
        setTab(value);
        setText("");
        if (pathname !== "/app/doc" || searchParams.get("tab") === value) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", value);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [pathname, router, searchParams]);

    // How the list is shown, sorted and filtered.
    const [view, setView] = useStoredState<DocsView>("docs.view", "grid", isView);
    const [sort, setSort] = React.useState<DocListSort>("edited");
    const [owner, setOwner] = React.useState<OwnerChoice | null>(null);
    const [space, setSpace] = React.useState<DocSpace | null>(null);
    const query = React.useMemo(() => ({ sort: sort === "edited" ? undefined : sort, owner: owner?.uuid, space: space ?? undefined }), [sort, owner, space]);
    const clearFilters = React.useCallback(() => {
        setOwner(null);
        setSpace(null);
    }, []);

    // Counts: each list's own, from the server.
    const [settled, setSettled] = React.useState(false);
    React.useEffect(() => {
        if (!chosen) return;
        const t = window.setTimeout(() => setSettled(true), 400);
        return () => window.clearTimeout(t);
    }, [chosen]);
    const { counts, trash } = useTabCounts(settled);
    const [listCounts, setListCounts] = React.useState<Partial<Record<DocTab, number>>>({});
    const onCount = React.useCallback((t: DocTab, n: number | undefined) => {
        setListCounts((prev) => (prev[t] === n ? prev : { ...prev, [t]: n }));
    }, []);
    const [searchCount, setSearchCount] = React.useState("");
    const tools = tabTools(tab);
    const filtered = (tools.owner && !!owner) || (tools.space && !!space);
    const shownCount = listCounts[tab];
    const heading = searching
        ? searchCount
        : shownCount === undefined
          ? ""
          : `${shownCount} ${shownCount === 1 ? "doc" : "docs"}${filtered ? " match these filters" : ""}`;

    // "/" searches and "N" starts a doc, from anywhere on the page but a field.
    const searchRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
            if (e.key === "/") {
                e.preventDefault();
                searchRef.current?.focus();
            } else if ((e.key === "n" || e.key === "N") && !busy) {
                e.preventDefault();
                void create({ space: newDocSpace });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [create, busy, newDocSpace]);

    const tabs = DOC_TABS.map((t) => ({ value: t, label: DOC_TAB_LABEL[t], count: counts[t] }));
    const [pagesOpen, setPagesOpen] = React.useState(false);

    return (
        <div className="flex h-full min-h-0 flex-col" data-docs-page="">
            <div className="mx-auto w-full max-w-[1040px] shrink-0 px-4 sm:px-8 sm:pt-8">
                {/* The title row: on a phone the app bar carries the title. */}
                <div className="flex min-h-14 items-center gap-3 max-sm:hidden">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-title-1 text-ink">Docs</h1>
                        <p className="mt-0.5 text-ui text-ink-2 tabular-nums" aria-live="polite">
                            {heading || " "}
                        </p>
                    </div>
                    <SearchPill inputRef={searchRef} value={text} onChange={setText} onClear={clearSearch} className="w-60" />
                    <NewDocButton space={newDocSpace} />
                </div>
                <div className="flex items-end gap-2">
                    <UnderlineTabs tabs={tabs} value={searching ? "" : tab} onValueChange={onTab} label="Docs" className="mt-4 min-w-0 flex-1 gap-4 max-sm:mt-0" />
                    <Link
                        href="/app/doc/trash"
                        className="mb-1.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-ui-sm text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
                    >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        <span className="max-sm:sr-only">Trash</span>
                        {trash !== undefined && trash > 0 && <span className="text-meta tabular-nums text-ink-3">{trash}</span>}
                    </Link>
                </div>
                {/* A phone searches in a full-width field under the tabs. */}
                <div className="pt-3 sm:hidden">
                    <SearchPill value={text} onChange={setText} onClear={clearSearch} className="h-11 w-full" />
                </div>
                {/* While searching, only the filter the search applies: whose docs. */}
                <DocsToolbar
                    className="mt-3"
                    tools={searching ? SEARCH_TOOLS : { ...tools, view: tab !== "archived" }}
                    off={searching ? undefined : tabToolsOff(tab)}
                    sort={sort}
                    onSort={setSort}
                    owner={owner}
                    onOwner={setOwner}
                    space={space}
                    onSpace={setSpace}
                    view={view}
                    onView={setView}
                    selfId={selfId}
                />
            </div>
            {searching ? (
                <React.Suspense fallback={<DocRowsSkeleton rows={5} />}>
                    <DocSearchResults key={`${debounced.trim()}|${owner?.uuid ?? ""}`} q={debounced} owner={owner?.uuid} selfId={selfId} onClear={clearSearch} onCount={setSearchCount} />
                </React.Suspense>
            ) : chosen ? (
                <DocListTabContent tab={tab} query={query} view={view} selfId={selfId} onCount={onCount} onClearFilters={clearFilters} />
            ) : view === "list" ? (
                <DocRowsSkeleton />
            ) : (
                <DocGridSkeleton withCreateCard />
            )}
            {/* The phone's Pages: the sidebar's page tree, in a sheet. */}
            <PhoneBarActions>
                <button type="button" onClick={() => setPagesOpen(true)} aria-label="Pages">
                    <PanelLeft aria-hidden="true" />
                </button>
            </PhoneBarActions>
            {pagesOpen && (
                <React.Suspense fallback={null}>
                    <PagesSheet onClose={() => setPagesOpen(false)} />
                </React.Suspense>
            )}
        </div>
    );
}

/** The 32 px search pill (e1, r8) with its "/" key; 44 px full width on a phone. */
function SearchPill({
    value,
    onChange,
    onClear,
    className,
    inputRef,
}: {
    value: string;
    onChange: (v: string) => void;
    onClear: () => void;
    className?: string;
    inputRef?: React.Ref<HTMLInputElement>;
}) {
    return (
        <label className={cn("group/search relative flex h-8 items-center gap-2 rounded-lg bg-raised px-2.5 text-ink-3 shadow-e1 focus-within:focus-halo", className)}>
            <Search className="size-3.5 shrink-0" aria-hidden="true" />
            <input
                ref={inputRef}
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-escape-own=""
                onKeyDown={(e) => {
                    // An input method's Escape drops the word being made, not the search.
                    if (e.key === "Escape" && !isComposingKey(e.nativeEvent)) {
                        onClear();
                        (e.target as HTMLInputElement).blur();
                    }
                }}
                placeholder="Search docs"
                aria-label="Search docs"
                maxLength={200}
                className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none placeholder:text-ink-3 max-sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
            />
            {value ? (
                <button type="button" onClick={onClear} aria-label="Clear search" className="inline-flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink max-sm:size-8">
                    <X className="size-3.5" />
                </button>
            ) : (
                <kbd className="kbd max-sm:hidden" aria-hidden="true">
                    /
                </kbd>
            )}
        </label>
    );
}
