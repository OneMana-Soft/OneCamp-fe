// One shape for a message's time, everywhere a message is shown.
//
// The clock is "3:10 PM", not "03:10 PM": a leading zero is a form field's
// habit, and in a column of messages it is the first thing the eye reads.
// Older messages say "Oct 9, 3:10 PM" (and the year only when it isn't this
// one), in the same month-name form the rest of the app uses ("Was due Oct 9"),
// instead of the "09/10/26" that read as the 10th of September to half the world.
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }

function toDate(dateString: string | number): Date {
    return new Date(typeof dateString === "number" ? dateString * 1000 : dateString)
}

export function formatClock(date: Date): string {
    return date.toLocaleTimeString("en-US", TIME)
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
    const sameYear = dateObject.getFullYear() === currentDate.getFullYear()
    const day = dateObject.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
    return `${day}, ${formatClock(dateObject)}`
}

/** The full date and time, for a timestamp's tooltip and its <time> element. */
export function formatFullTimestamp(dateString: string | number): string {
    const dateObject = toDate(dateString)
    if (isNaN(dateObject.getTime())) return ""
    return dateObject.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...TIME })
}

/** ISO form for a <time dateTime>, or undefined when the date can't be read. */
export function isoTimestamp(dateString: string | number): string | undefined {
    const dateObject = toDate(dateString)
    return isNaN(dateObject.getTime()) ? undefined : dateObject.toISOString()
}

/**
 * A list's time column ("3:10 AM", "Yesterday", "Oct 9"): the row says when,
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
    const sameYear = dateObject.getFullYear() === now.getFullYear()
    return dateObject.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

/**
 * "3:10", for the time beside a message that continues the one above it: the
 * gutter is an avatar wide, and the hour and minute are what tell two
 * messages apart there. The full time is in its tooltip.
 */
export function formatGutterClock(dateString: string | number): string {
    const dateObject = toDate(dateString)
    if (isNaN(dateObject.getTime())) return ""
    return dateObject.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[AP]M$/i, "")
}
