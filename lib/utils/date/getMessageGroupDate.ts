import { format } from "date-fns"

/**
 * The heading over a day's messages: "Today", "Yesterday", then "Friday 9 Oct"
 * (and the year when it isn't this one), in the app's one date format
 * (lib/utils/date/shortDate). It was "Friday, Oct 9, 2026".
 */
export function getGroupDateHeading(date: string) {
    const day = new Date(date)
    const now = new Date()
    const isToday = day.toLocaleDateString() === now.toLocaleDateString()
    const isYesterday = day.toLocaleDateString() === new Date(Date.now() - 86400000).toLocaleDateString()
    if (isToday) return 'Today'
    if (isYesterday) return 'Yesterday'
    return format(day, day.getFullYear() === now.getFullYear() ? "EEEE d MMM" : "EEEE d MMM yyyy")
}
