import type { RowMeta } from "@/types/virtual"

/** The newest rows whose images are fetched first (next/image priority). */
export const PRIORITY_ROWS = 5

/**
 * A row's place in the conversation, as the few flags it draws from. The list
 * hands rows these rather than an index, so a row's props stay the same when
 * older messages load above it or a new one arrives below (see MessageRow).
 */
export function rowMeta(index: number, total: number, continued?: boolean): RowMeta {
    return {
        priority: index >= total - PRIORITY_ROWS,
        isLast: index === total - 1,
        continued: !!continued,
    }
}
