/** What a doc's title shows: the title, or the placeholder it has until someone names it (D-6). */
export const titleOf = (t: string | undefined) => (t ?? "").trim() || "Untitled"
