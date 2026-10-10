// One shape for a message's time, everywhere a message is shown, in the app's
// one date and time format (lib/utils/date/shortDate).
//
// The clock is "3:10 PM", not "03:10 PM": a leading zero is a form field's
// habit, and in a column of messages it is the first thing the eye reads.
// Older messages say "9 Oct, 3:10 PM" (and the year only when it isn't this
// one), as every list and due date does, instead of the "09/10/26" that read
// as the 10th of September to half the world.
import { fullDateTime, shortDate, shortDateTime, shortTime } from "@/lib/utils/date/shortDate"

function toDate(dateString: string | number): Date {
    return new Date(typeof dateString === "number" ? dateString * 1000 : dateString)
}

export function formatClock(date: Date): string {
    return shortTime(date)
}

export function formatTimeForPostOrComment(dateString: string | number, onlyTime: boolean = false): string {
    const dateObject = toDate(dateString)
    if (isNaN(dateObject.getTime())) {
        return ""
    }
    const currentDate = new Date()
    const yesterday = new Date()
    yesterday.setDate(currentDate.getDate() - 1)

    if (dateObject.toDateString() === currentDate.toDateString() || onlyTime) {
        return formatClock(dateObject)
    }
    if (dateObject.toDateString() === yesterday.toDateString()) {
        return "Yesterday " + formatClock(dateObject)
    }
    return shortDateTime(dateObject, currentDate)
}

/** The full date and time, for a timestamp's tooltip and its <time> element. */
export function formatFullTimestamp(dateString: string | number): string {
    const dateObject = toDate(dateString)
    if (isNaN(dateObject.getTime())) return ""
    return fullDateTime(dateObject)
}

/** ISO form for a <time dateTime>, or undefined when the date can't be read. */
export function isoTimestamp(dateString: string | number): string | undefined {
    const dateObject = toDate(dateString)
    return isNaN(dateObject.getTime()) ? undefined : dateObject.toISOString()
}

/**
 * A list's time column ("3:10 AM", "Yesterday", "9 Oct"): the row says when,
 * at a glance, and the conversation holds the exact time. "Yesterday 09:48 AM"
 * was wider than the name beside it.
 */
export function formatListTimestamp(dateString: string | number): string {
    const dateObject = toDate(dateString)
    if (isNaN(dateObject.getTime())) return ""
    const now = new Date()
    const yesterday = new Date()
    yesterday.setDate(now.getDate() - 1)
    if (dateObject.toDateString() === now.toDateString()) return formatClock(dateObject)
    if (dateObject.toDateString() === yesterday.toDateString()) return "Yesterday"
    return shortDate(dateObject, now)
}

/**
 * "3:10 PM", for the time beside a message that continues the one above it.
 * It was "3:10" alone, to fit the gutter, an avatar wide; but a time with no
 * AM or PM could be either, and the gutter now lets it run into the row's
 * margin instead. The full date is in its tooltip.
 */
export function formatGutterClock(dateString: string | number): string {
    const dateObject = toDate(dateString)
    if (isNaN(dateObject.getTime())) return ""
    return formatClock(dateObject)
}
