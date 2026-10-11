import { addDays, startOfDay } from "date-fns"

/**
 * Reads what a person types into the calendar's quick-create card ("Lunch
 * with Maya at 1pm tomorrow for 45m") into an event: a title, a day, a start
 * time, a length, the people named after "with", and whether it is focus
 * time. Each part it understood is returned as a span of the text, so the
 * card can underline it. Pure: `now` is passed in.
 *
 * What it reads:
 *   time      "at 1pm", "1:30 pm", "13:30", "at 9", "noon"
 *   day       "today", "tonight", "tomorrow", "mon".."sunday" (the next one),
 *             "next friday", "15 Oct", "Oct 15", "on the 15th"
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

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

const WD = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)"
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"

function weekdayIndex(word: string): number {
  const w = word.toLowerCase().slice(0, 3)
  return WEEKDAYS.findIndex((d) => d.startsWith(w))
}

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.toLowerCase().slice(0, 3))
}

/** The next date with that day of the month and month, this year or next. */
function nextDate(now: Date, month: number, day: number): Date {
  const today = startOfDay(now)
  let d = new Date(now.getFullYear(), month, day)
  if (d < today) d = new Date(now.getFullYear() + 1, month, day)
  return d
}

export function parseEventText(text: string, now: Date = new Date()): ParsedEvent {
  const spans: ParsedEvent["spans"] = []
  const taken: Array<[number, number]> = []
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && a < e)
  const take = (s: number, e: number, kind: ParsedEvent["spans"][number]["kind"], strip = true) => {
    spans.push({ start: s, end: e, kind })
    if (strip) taken.push([s, e])
  }
  const out: ParsedEvent = { title: "", people: [], focus: false, spans }
  const today = startOfDay(now)

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

  // Time: "at 1pm", "1:30pm", "at 13:30", "at 9", "noon".
  each(/\b(?:at\s+)?(noon|midday|midnight)\b|\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])|\bat\s+(\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2}):(\d{2})\b/gi, (m) => {
    let h: number
    let min = 0
    if (m[1]) {
      h = /midnight/i.test(m[1]) ? 0 : 12
    } else if (m[2]) {
      h = Number(m[2]) % 12
      min = Number(m[3] || 0)
      if (/^p/i.test(m[4])) h += 12
    } else if (m[5]) {
      h = Number(m[5])
      min = Number(m[6] || 0)
      // "at 3" means the afternoon; working hours are 8 to 7.
      if (h >= 1 && h <= 7) h += 12
    } else {
      h = Number(m[7])
      min = Number(m[8])
    }
    if (h > 23 || min > 59) return
    out.startMinutes = h * 60 + min
    take(m.index, m.index + m[0].length, "time")
    return true
  })

  // Day.
  each(
    new RegExp(
      `\\b(today|tonight|tomorrow|tmrw)\\b|\\b(?:on\\s+)?(next\\s+)?${WD}\\b|\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\b|\\b(?:on\\s+)?${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b|\\bon\\s+the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`,
      "gi",
    ),
    (m) => {
      if (m[1]) {
        const w = m[1].toLowerCase()
        out.date = w === "tomorrow" || w === "tmrw" ? addDays(today, 1) : today
        if (w === "tonight" && out.startMinutes === undefined) out.startMinutes = 19 * 60
      } else if (m[3]) {
        const target = weekdayIndex(m[3])
        let diff = (target - today.getDay() + 7) % 7
        // "Friday" on a Friday, and "next Friday", are a week out.
        if (diff === 0) diff = 7
        out.date = addDays(today, diff)
      } else if (m[4] && m[5]) {
        out.date = nextDate(now, monthIndex(m[5]), Number(m[4]))
      } else if (m[6] && m[7]) {
        out.date = nextDate(now, monthIndex(m[6]), Number(m[7]))
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
