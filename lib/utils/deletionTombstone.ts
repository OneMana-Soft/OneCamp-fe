// deletionTombstone.ts — a tiny, generic "recently deleted" registry used to
// keep client-initiated deletions sticky against server-window merges.
//
// The problem it solves (applies to channel posts, DMs, and group chats):
// a user deletes an item -> we optimistically remove it from Redux -> that
// state change re-triggers a "merge the latest window" reconcile whose window
// was fetched BEFORE the delete and therefore still contains the item -> the
// merge treats it as a brand-new item and re-adds it, so the delete appears to
// do nothing even though the server returned 200. See mergeChannelPosts /
// mergeChats / mergeGroupChats.
//
// A tombstone records "this id was deleted at time T" per container (channel /
// dm / group). Merge reducers consult it and refuse to re-introduce a
// tombstoned id.
//
// IMPORTANT — this must NOT break the soft-delete + admin restore/unarchive
// flow. Deletion is a soft delete; an admin can restore a post/chat later.
// Restore does not push a live event, it reappears on the client's next fetch.
// So the tombstone is deliberately:
//   1. SHORT-LIVED — it only needs to outlast the immediate "optimistic delete
//      re-triggers a merge from a window fetched before the delete" race, which
//      resolves in seconds once SWR revalidates. The TTL is sized to that race,
//      not to "forever", so a restore can never be suppressed for long. (The
//      slices holding it are also not persisted, so a page reload clears it and
//      a restore shows immediately.)
//   2. CLEARED ON RE-INTRODUCTION — clearTombstone is called whenever an item
//      with the same id is legitimately (re)created/restored into state, so a
//      restore that does surface is honoured at once.
//
// Every function here is pure over the map it is handed (Immer-friendly,
// unit-testable) and reusable across every slice.

/** container id (channelId / dmId / grpId) -> item id (uuid) -> deleted-at ms. */
export type TombstoneMap = Record<string, Record<string, number>>

/**
 * How long a deletion stays sticky. Sized to defeat the optimistic-delete vs
 * stale-window-merge race (which clears within a render cycle to a few seconds
 * once the cache revalidates), with margin — NOT a long-term block, so a soft
 * delete that an admin later restores is never hidden for more than this.
 */
export const TOMBSTONE_TTL_MS = 60 * 1000

/** Record that `id` was deleted in `containerId`. No-op on empty inputs. */
export function markTombstone(
    map: TombstoneMap,
    containerId: string,
    id: string,
    now: number = Date.now(),
): void {
    if (!map || !containerId || !id) return
    if (!map[containerId]) map[containerId] = {}
    map[containerId][id] = now
}

/**
 * Forget the tombstone for `id` in `containerId`. Call when an item is
 * legitimately (re)created or restored so the restore/unarchive flow is
 * honoured immediately and never suppressed by a stale deletion marker.
 */
export function clearTombstone(map: TombstoneMap, containerId: string, id: string): void {
    if (!map || !containerId || !id) return
    const bucket = map[containerId]
    if (!bucket) return
    delete bucket[id]
    if (Object.keys(bucket).length === 0) delete map[containerId]
}

/**
 * Report whether `id` is currently tombstoned in `containerId`. Pure: never
 * mutates the map (expiry is handled by pruneTombstones so reads stay
 * side-effect free and safe to call from selectors/merges).
 */
export function isTombstoned(
    map: TombstoneMap,
    containerId: string,
    id: string,
    now: number = Date.now(),
    ttlMs: number = TOMBSTONE_TTL_MS,
): boolean {
    if (!map || !containerId || !id) return false
    const bucket = map[containerId]
    if (!bucket) return false
    const ts = bucket[id]
    if (ts === undefined) return false
    return now - ts <= ttlMs
}

/**
 * Drop expired entries for a container (and the container bucket itself when
 * empty). Call at the start of a merge so the map stays bounded. Safe to call
 * when the container has no tombstones.
 */
export function pruneTombstones(
    map: TombstoneMap,
    containerId: string,
    now: number = Date.now(),
    ttlMs: number = TOMBSTONE_TTL_MS,
): void {
    if (!map || !containerId) return
    const bucket = map[containerId]
    if (!bucket) return
    for (const id of Object.keys(bucket)) {
        if (now - bucket[id] > ttlMs) delete bucket[id]
    }
    if (Object.keys(bucket).length === 0) delete map[containerId]
}


/**
 * Metadata captured immediately before fetching an authoritative latest page.
 * Existing callers may omit it; in that case an empty page remains a no-op.
 */
export interface LatestWindowAuthority {
    authoritativeThrough?: number
}

interface ReconcileLatestWindowOptions<T> extends LatestWindowAuthority {
    existing: T[]
    incoming: T[]
    getId: (item: T) => string | undefined
    getCreatedAt: (item: T) => string | number | Date
    contentDiffers: (current: T, server: T) => boolean
    isOptimistic?: (item: T) => boolean
    shouldAcceptIncoming?: (item: T) => boolean
    mergeMatched?: (current: T, server: T) => T
    sort?: (a: T, b: T) => number
}

/**
 * Reconcile a loaded conversation with an authoritative latest page.
 *
 * A non-empty page is authoritative from its oldest item through either the
 * explicit request watermark or (for backward compatibility) its newest item.
 * An empty page is authoritative only when a watermark is supplied; it then
 * covers all server-backed items created before that request began. Items
 * marked optimistic are never removed merely because they are absent.
 *
 * `shouldAcceptIncoming` can suppress tombstoned rows without changing the
 * raw page's authority bounds. The original array is returned when no content
 * changed, keeping reconnects quiet and reference-stable.
 */
export function reconcileLatestWindow<T>({
    existing,
    incoming,
    getId,
    getCreatedAt,
    contentDiffers,
    isOptimistic = () => false,
    shouldAcceptIncoming = () => true,
    mergeMatched = (current, server) => ({ ...current, ...server }),
    sort,
    authoritativeThrough,
}: ReconcileLatestWindowOptions<T>): T[] {
    const toTimestamp = (value: string | number | Date): number => {
        if (typeof value === "number") return value
        if (value instanceof Date) return value.getTime()
        return Date.parse(value)
    }
    const accepted = incoming.filter(shouldAcceptIncoming)
    const rawTimes = incoming
        .map((item) => toTimestamp(getCreatedAt(item)))
        .filter(Number.isFinite)
    const explicitThrough = Number.isFinite(authoritativeThrough)
        ? authoritativeThrough
        : undefined

    // Without explicit authority, an empty response is ambiguous (legacy
    // dispatch, pagination, cached response) and must remain non-destructive.
    if (incoming.length === 0 && explicitThrough === undefined) return existing

    const windowMin = rawTimes.length > 0 ? Math.min(...rawTimes) : Number.NEGATIVE_INFINITY
    const inferredMax = rawTimes.length > 0 ? Math.max(...rawTimes) : Number.NEGATIVE_INFINITY
    const windowMax = explicitThrough ?? inferredMax

    const serverById = new Map<string, T>()
    for (const item of accepted) {
        const id = getId(item)
        if (id) serverById.set(id, item)
    }

    let changed = false
    const next: T[] = []

    for (const current of existing) {
        const id = getId(current)
        const server = id ? serverById.get(id) : undefined
        if (id && server) {
            if (contentDiffers(current, server) || isOptimistic(current)) {
                next.push(mergeMatched(current, server))
                changed = true
            } else {
                next.push(current)
            }
            serverById.delete(id)
            continue
        }

        const createdAt = toTimestamp(getCreatedAt(current))
        const inWindow = Number.isFinite(createdAt) && createdAt >= windowMin && createdAt <= windowMax
        if (id && inWindow && !isOptimistic(current)) {
            changed = true
        } else {
            next.push(current)
        }
    }

    for (const item of accepted) {
        const id = getId(item)
        if (id && serverById.has(id)) {
            next.push(item)
            serverById.delete(id)
            changed = true
        }
    }

    if (!changed) return existing
    return sort ? next.sort(sort) : next
}
