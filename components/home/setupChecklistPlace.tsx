"use client"

/**
 * The setup checklist's place on Home (components/home/SetupChecklist): what
 * Home reads before the card's own code has come. The card is a chunk of its
 * own, since only an admin with steps left sees it, and its 22 KB of source
 * rode in every member's Home. While it comes, Home holds the card's shape
 * where this browser last showed it, as the card itself does while its state
 * loads, so nothing jumps.
 */
import { useLayoutEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What this browser last knew of the card: "open" when it had steps to show,
 * "closed" once it was finished or hidden. It decides whether Home holds the
 * card's place while the card loads, so a finished workspace never reserves
 * space for a card that won't come, and an unfinished one doesn't jump when it
 * does.
 */
export const CHECKLIST_MEMO_KEY = "oc_setup_checklist"
export type Memo = "open" | "closed" | null

export function readMemo(): Memo {
    try {
        const v = localStorage.getItem(CHECKLIST_MEMO_KEY)
        return v === "open" || v === "closed" ? v : null
    } catch {
        return null
    }
}

/**
 * Whether the signed-in person is an admin, from the side-nav answer: unknown
 * (undefined) until it arrives, then yes or no. The server leaves
 * user_is_admin out when it is false (omitempty), so reading the field alone
 * kept a member "unknown" for good, and a browser that had shown the card
 * held its place as a skeleton on Home forever. A failed answer is a no: the
 * card is a hint, never worth a skeleton. Pure.
 */
export function adminFromSidenav(res: { data?: { data?: { user_is_admin?: boolean } }; error?: unknown }): boolean | undefined {
    if (res.data) return res.data.data?.user_is_admin === true
    return res.error ? false : undefined
}

/** Whether to hold the card's place while its state loads. Pure. */
export function holdChecklistPlace(isAdmin: boolean | undefined, loaded: boolean, memo: Memo): boolean {
    if (loaded || isAdmin === false || memo === "closed") return false
    // Before we know who this is, hold it only where this browser has shown it.
    if (isAdmin === undefined) return memo === "open"
    return true
}

/** The card's well: the sunken ground the card and its placeholder sit on. */
export const WELL = "rounded-2xl bg-sunken p-3.5 ring-1 ring-inset ring-line dark:bg-white/[0.025]"

/** The card's shape while it loads: its header and three step rows. */
export function ChecklistPlaceholder() {
    return (
        <div role="status" aria-label="Loading the setup checklist" aria-busy="true" className={WELL}>
            <div aria-hidden="true">
                <div className="flex items-center gap-3 px-1 pb-3.5">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-1 w-32" />
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex min-h-[132px] flex-col gap-2.5 rounded-lg bg-sheet p-3.5 shadow-e1 dark:bg-[#18191C]">
                            <Skeleton className="size-8 rounded-[9px]" />
                            <Skeleton className="h-3.5 w-2/3" />
                            <Skeleton className="h-3 w-4/5" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * Home's stand-in while the card's code loads: the placeholder where this
 * browser last showed the card, nothing where it was finished or hidden. Read
 * before the first paint, as the card reads it.
 */
export function ChecklistPlace() {
    const [memo, setMemo] = useState<Memo>(null)
    useLayoutEffect(() => setMemo(readMemo()), [])
    return holdChecklistPlace(true, false, memo) ? <ChecklistPlaceholder /> : null
}
