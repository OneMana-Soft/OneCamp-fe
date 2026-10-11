/**
 * The time on a message, in the reader's own clock.
 *
 * Chat follows the viewer's locale (design v3 chat, coordinator's decision of
 * 11 Oct 2026): "10:31 PM" where people read a 12-hour clock, "22:31" where
 * they read a 24-hour one. Digits are tabular wherever it is drawn, so a
 * column of times lines up, and the gutter beside a continued message is
 * sized for the widest form either clock writes ("12:59 PM").
 *
 * The rest of the app keeps its one written format (lib/utils/date/shortDate);
 * this is the conversation's clock only.
 */

let formatter: Intl.DateTimeFormat | null = null
let formatterLocale: string | undefined

function clockFormatter(locale?: string): Intl.DateTimeFormat {
    if (!formatter || formatterLocale !== locale) {
        formatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
        formatterLocale = locale
    }
    return formatter
}

function toDate(value: string | number | Date): Date {
    if (value instanceof Date) return value
    return new Date(typeof value === "number" ? value * 1000 : value)
}

/** "10:31 PM" or "22:31", as the reader's locale writes a time of day. */
export function chatClock(value: string | number | Date, locale?: string): string {
    const d = toDate(value)
    if (isNaN(d.getTime())) return ""
    return clockFormatter(locale).format(d)
}

/** Whether the reader's locale writes a 12-hour clock (an AM/PM after the time). */
export function readsTwelveHour(locale?: string): boolean {
    return clockFormatter(locale).resolvedOptions().hour12 === true
}
