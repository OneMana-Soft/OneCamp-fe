import { format } from "date-fns"

/**
 * The heading over a day's messages (design v3 chat, C15): "Today",
 * "Yesterday", the weekday within this week ("Thursday"), "Thu 2 Oct" earlier
 * this year, and "2 Oct 2025" before that.
 */
export function getGroupDateHeading(date: string, now: Date = new Date()) {
    const day = new Date(date)
    if (isNaN(day.getTime())) return ""
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round((startOf(now) - startOf(day)) / 86400000)
    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    if (days > 1 && days < 7) return format(day, "EEEE")
    if (day.getFullYear() === now.getFullYear()) return format(day, "EEE d MMM")
    return format(day, "d MMM yyyy")
}
