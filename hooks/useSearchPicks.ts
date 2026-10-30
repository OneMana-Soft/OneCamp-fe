import { useCallback, useEffect, useRef, useState } from "react";
import { useStableCallback } from "@/hooks/useStableCallback";
import { useGlobalSearch, type SearchResult } from "@/services/searchService";

/**
 * What a picker offers for what's typed (Admin › Apps' place picker, the
 * entity-link picker): the workspace search asked 180 ms after the last key,
 * `pick` keeping what the picker offers, up to `limit`, and only the latest
 * question's answer kept. Nothing while `enabled` is false or nothing is
 * typed. A failed search is said as one (`failed`, and `retry` asks again),
 * never as "nothing matches" and never left "searching"; the picker says it
 * in place, so it raises no toast. The search and `pick` are read as the
 * question is asked, so an inline `pick`, or a search that is new on each
 * draw, never asks again. Its own module, so the search page, which loads
 * services/searchService, doesn't carry it.
 */
export function useSearchPicks<T>(query: string, pick: (r: SearchResult) => T | null, { enabled = true, limit = 8 }: { enabled?: boolean; limit?: number } = {}) {
    const search = useStableCallback(useGlobalSearch({ quiet: true }).search);
    const keep = useStableCallback(pick);
    const [items, setItems] = useState<T[]>([]);
    const [searching, setSearching] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const latest = useRef(0);

    useEffect(() => {
        const q = query.trim();
        const mine = ++latest.current;
        if (!enabled || !q) {
            setItems((was) => (was.length ? [] : was));
            setSearching(false);
            setFailed(false);
            return;
        }
        setSearching(true);
        setFailed(false);
        const timer = window.setTimeout(async () => {
            const found: T[] = [];
            let broke = false;
            try {
                for (const r of (await search(q))?.page ?? []) {
                    const p = keep(r);
                    if (p) found.push(p);
                    if (found.length >= limit) break;
                }
            } catch {
                broke = true;
            }
            if (mine !== latest.current) return;
            setItems(found);
            setFailed(broke);
            setSearching(false);
        }, 180);
        return () => window.clearTimeout(timer);
    }, [query, enabled, limit, attempt, search, keep]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);
    return { items, searching, failed, retry };
}
