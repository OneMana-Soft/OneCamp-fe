import { addDays, startOfDay } from "date-fns"
import { hourOn, monthDate, monthIndex, MONTH_WORD, plainWords, readTime, TOMORROW_WORD, TONIGHT_HOUR, weekdayDate, weekdayIndex, WEEKDAY_WORD, type TimeWords } from "@/lib/time/dayWords"

/**
 * Reads what a person types into the calendar's quick-create card ("Lunch
 * with Maya at 1pm tomorrow for 45m") into an event: a title, a day, a start
 * time, a length, the people named after "with", and whether it is focus
 * time. Each part it understood is returned as a span of the text, so the
 * card can underline it. Pure: `now` is passed in. A day or a time means what
 * it means in Remind me's words: both read them through lib/time/dayWords.
 *
 * What it reads:
 *   time      "at 1pm", "1:30 pm", "13:30", "at 9", "noon" ("at 3" and "7:30"
 *             the afternoon's, "07:30" as written)
 *   day       "today", "tonight" (20:00), "tomorrow", "mon".."sunday" (the
 *             coming one), "this friday", "next friday" (next week's), "15
 *             Oct", "Oct 15", "on the 15th"; "Feb 30" is no day
 *   length    "for 45m", "for 1.5 hours", "for an hour", "for half an hour"
 *   people    "with Maya", "with Maya and Jonas" (capitalised names)
 *   focus     the word "focus"
 * Day, time and length words leave the title; "with Maya" stays in it.
 */
export interface ParsedEvent {
  title: string
  /** The day, at midnight, when one was named. */
  date?: Date
  /** Minutes from midnight, when a time was named. */
  startMinutes?: number
  durationMinutes?: number
  people: string[]
  focus: boolean
  /** The parts of the text that were read, for underlining. */
  spans: Array<{ start: number; end: number; kind: "time" | "date" | "duration" | "people" | "focus" }>
}

/** With `clock` (a time box), a time typed alone is a clock's ("7:30" is 07:30); said with a day, it is read as words are. */
export function parseEventText(text: string, now: Date = new Date(), { clock = false }: { clock?: boolean } = {}): ParsedEvent {
  const spans: ParsedEvent["spans"] = []
  const taken: Array<[number, number]> = []
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && a < e)
  const take = (s: number, e: number, kind: ParsedEvent["spans"][number]["kind"], strip = true) => {
    spans.push({ start: s, end: e, kind })
    if (strip) taken.push([s, e])
  }
  const out: ParsedEvent = { title: "", people: [], focus: false, spans }
  const today = startOfDay(now)
  // Set in the callbacks below (a cast, so the checker keeps both kinds).
  let time = null as TimeWords | null
  let timeWords = ""
  let tonight = false

  const each = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!free(m.index, m.index + m[0].length)) continue
      if (fn(m) === true) break
    }
  }

  // Length first: "for 1 hour" must not read as a time.
  each(/\bfor\s+(?:(half\s+an?\s+hour)|(an?\s+hour)|(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?))\b/gi, (m) => {
    if (m[1]) out.durationMinutes = 30
    else if (m[2]) out.durationMinutes = 60
    else {
      const n = Number(m[3])
      out.durationMinutes = Math.round(/^h/i.test(m[4]) ? n * 60 : n)
    }
    take(m.index, m.index + m[0].length, "duration")
    return true
  })

  // Time: "at 1pm", "1:30pm", "at 13:30", "at 9", "noon", found here and read as Remind me reads it.
  each(/\b(?:at\s+)?(?:noon|midday|midnight)\b|\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)(?![a-z])|\bat\s+\d{1,2}(?::\d{2})?\b|\b\d{1,2}:\d{2}\b/gi, (m) => {
    timeWords = plainWords(m[0])
    time = readTime(timeWords)
    if (!time) return
    take(m.index, m.index + m[0].length, "time")
    return true
  })

  // Day.
  each(
    new RegExp(
      `\\b(today|tonight|${TOMORROW_WORD})\\b|\\b(?:on\\s+)?(?:(this|next)\\s+)?${WEEKDAY_WORD}\\b|\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_WORD}\\b|\\b(?:on\\s+)?${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|\\bon\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`,
      "gi",
    ),
    (m) => {
      if (m[1]) {
        const w = m[1].toLowerCase()
        tonight = w === "tonight"
        out.date = w === "today" || tonight ? today : addDays(today, 1)
      } else if (m[3]) {
        out.date = weekdayDate(now, weekdayIndex(m[3]), m[2]?.toLowerCase())
      } else if ((m[4] && m[5]) || (m[6] && m[7])) {
        // A day its month doesn't have ("Feb 30") stays in the title.
        const d = m[4] ? monthDate(now, monthIndex(m[5]), Number(m[4])) : monthDate(now, monthIndex(m[6]), Number(m[7]))
        if (!d) return
        out.date = d
      } else if (m[8]) {
        const day = Number(m[8])
        let d = new Date(today.getFullYear(), today.getMonth(), day)
        if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day)
        out.date = d
      } else return
      take(m.index, m.index + m[0].length, "date")
      return true
    },
  )

  // "tonight" alone is 20:00, and an hour said tonight the evening's.
  if (time && clock && !out.date) time = readTime(timeWords, true)
  if (time) out.startMinutes = hourOn(time, tonight) * 60 + time.minute
  else if (tonight) out.startMinutes = TONIGHT_HOUR * 60

  // People: "with Maya", "with Maya and Jonas". They stay in the title.
  each(/\bwith\s+((?:[A-Z][\w'-]+)(?:\s*(?:,|and|&)\s*[A-Z][\w'-]+)*)/g, (m) => {
    out.people = m[1].split(/\s*(?:,|and|&)\s*/).filter(Boolean)
    const at = m.index + m[0].length - m[1].length
    take(at, at + m[1].length, "people", false)
    return true
  })

  each(/\bfocus\b/gi, (m) => {
    out.focus = true
    take(m.index, m.index + m[0].length, "focus", false)
    return true
  })

  // The title is what's left, tidied.
  let title = ""
  let i = 0
  for (const [s, e] of [...taken].sort((a, b) => a[0] - b[0])) {
    title += text.slice(i, s) + " "
    i = e
  }
  title += text.slice(i)
  out.title = title.replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").replace(/^[\s,;]+|[\s,;]+$/g, "").trim()
  if (!out.title && out.focus) out.title = "Focus time"
  spans.sort((a, b) => a.start - b.start)
  return out
}

/** The start and end a parse names, from a default start and length. */
export function parsedRange(p: ParsedEvent, fallbackStart: Date, fallbackMinutes: number): { start: Date; end: Date } {
  const day = p.date ? new Date(p.date) : startOfDay(fallbackStart)
  const minutes = p.startMinutes ?? fallbackStart.getHours() * 60 + fallbackStart.getMinutes()
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60)
  const end = new Date(start.getTime() + (p.durationMinutes ?? fallbackMinutes) * 60_000)
  return { start, end }
}
