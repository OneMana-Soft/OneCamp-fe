/** What the admin is told about the licence's seats. Pure. */
export interface SeatSummary {
    text: string
    /** "full" when no one else can join, "near" at 80% or more. */
    tone: "ok" | "near" | "full"
}

export function seatSummary(used: number, limit: number): SeatSummary | null {
    if (!limit || limit <= 0) return null // unlimited: nothing to say
    const left = Math.max(0, limit - used)
    if (left === 0) {
        return {
            tone: "full",
            text: `Free plan: all ${limit} places are taken. New people cannot join until someone is deactivated or the limit is removed.`,
        }
    }
    return {
        tone: used / limit >= 0.8 ? "near" : "ok",
        text: `Free plan: ${used} of ${limit} people, ${left} ${left === 1 ? "place" : "places"} left.`,
    }
}
