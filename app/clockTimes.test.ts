import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { clockTime } from "@/lib/utils/date/clock"

/**
 * One clock rule (owner, 12 Oct 2026): a time of day follows the reader's
 * locale, through one helper, lib/utils/date/clock (Intl.DateTimeFormat with
 * the reader's locale and hour cycle; a person's own 12/24-hour choice wins).
 *
 * In an American browser Home said "Standup at 09:15" (a fixed 24-hour
 * clock) while the shell's foot, chat and the calendar said "8:08 AM". This
 * fails on a time written any other way:
 *   - toLocaleTimeString, or a toLocaleString with an hour in its options;
 *   - an Intl.DateTimeFormat given an hour, a minute or a time style, or asked
 *     for its hour cycle (readsTwelveHour says it); a formatToParts that only
 *     reads a zone's hour for arithmetic is fine;
 *   - a date-fns pattern with a time in it ("h:mm a", "HH:mm", "p"), except a
 *     machine stamp that starts "yyyy-MM-dd" (a datetime-local value, a file
 *     name that sorts);
 *   - hours padded by hand ("09:" + minutes);
 *   - a clock time spelled into copy ("5:00 PM", "at 17:00").
 */

const HELPER = "lib/utils/date/clock.ts"

// Files that still write a time by hand, each with its owner. Empty it.
const PENDING = new Map<string, string>([])

function files(path: string): string[] {
  const s = statSync(path)
  if (s.isFile()) return [path]
  if (/node_modules|\.next|test-results/.test(path)) return []
  return readdirSync(path).flatMap((name) => files(join(path, name)))
}

const sources = ["app", "components", "hooks", "lib", "services"]
  .flatMap(files)
  .filter((f) => /\.(tsx?|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== HELPER)

/** Code without comments, so a doc comment that names a call doesn't count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")

/** Each call's argument text, its parentheses balanced, and what follows the call. */
function calls(src: string, re: RegExp): { args: string; after: string }[] {
  const out: { args: string; after: string }[] = []
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < src.length && depth; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")") depth--
    }
    out.push({ args: src.slice(m.index + m[0].length, i - 1), after: src.slice(i, i + 40) })
  }
  return out
}

/** A date-fns pattern's letters outside its quoted literals. */
const patternLetters = (p: string) => p.replace(/'[^']*'/g, "")
const TIME_TOKENS = /[hHkKaBbp]|m/

function offences(f: string, src: string): string[] {
  const out: string[] = []
  const say = (why: string) => out.push(`${f}: ${why}`)
  if (/\.toLocaleTimeString\(/.test(src)) say("toLocaleTimeString; write the time with clockTime")
  for (const c of calls(src, /\.toLocale(?:Date)?String\(/g)) if (/\b(hour|minute|timeStyle)\b/.test(c.args)) say(`toLocaleString(${c.args.slice(0, 60)}) writes a time; use clockTime`)
  for (const c of calls(src, /\bIntl\.DateTimeFormat\(/g)) {
    if (!/\b(hour|minute|timeStyle|hourCycle|hour12|dayPeriod)\b/.test(c.args)) continue
    if (/^\s*\.formatToParts\(/.test(c.after)) continue
    say(`Intl.DateTimeFormat(${c.args.replace(/\s+/g, " ").slice(0, 70)}) writes a time; use clockTime, clockHour or clockRange`)
  }
  if (/resolvedOptions\(\)\s*\.\s*(hour12|hourCycle)\b/.test(src)) say("reads the hour cycle itself; use readsTwelveHour")
  if (/\bclock(?:Time|Hour|Range)\([^)]*\)\s*\.\s*(?:replace|slice|split|substring)\(/.test(src)) say("cuts a clock time up by hand; use clockTime's compact or bare form")
  const fns = /from ["']date-fns(-tz)?["']/.test(src)
  if (fns) {
    for (const c of calls(src, /\b(?:format|formatInTimeZone|lightFormat)\(/g)) {
      for (const m of c.args.matchAll(/(["'`])((?:(?!\1).)*)\1/g)) {
        const pattern = m[2]
        if (pattern.includes("${")) continue
        const letters = patternLetters(pattern)
        if (!/[dMyEL]|[hHkKmap]/.test(letters) || !TIME_TOKENS.test(letters)) continue
        if (/^yyyy-MM-dd/.test(pattern)) continue // a machine stamp
        say(`date-fns "${pattern}" writes a time; use clockTime`)
      }
    }
  }
  for (const line of src.split("\n")) {
    if (/get(?:UTC)?Hours\(\)/.test(line) && (/padStart\(/.test(line) || /\$\{[^}]*\}\s*[:.]\s*\$\{/.test(line))) say(`pads an hour by hand: ${line.trim().slice(0, 90)}`)
  }
  for (const m of src.matchAll(/["'`>][^"'`<>\n]*?\b(\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)\b|(?:at|until|from|by)\s+\d{1,2}:\d{2}\b)/g)) {
    say(`spells a clock time into copy ("${m[1]}"); write it with clockTime`)
  }
  return out
}

describe("one clock", () => {
  it("scans the whole app", () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it("writes every time of day through lib/utils/date/clock", () => {
    const found = sources.filter((f) => !PENDING.has(f)).flatMap((f) => offences(f, code(readFileSync(f, "utf8"))))
    expect(found).toEqual([])
  })

  it("keeps its pending list honest: each file listed still writes a time by hand", () => {
    for (const f of PENDING.keys()) expect(offences(f, code(readFileSync(f, "utf8"))).length, f).toBeGreaterThan(0)
  })

  it("catches each way a time used to be written", () => {
    const caught = (src: string) => offences("x.tsx", code(src)).length > 0
    expect(caught(`d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })`)).toBe(true)
    expect(caught(`new Date(x).toLocaleString(undefined, { weekday: "short", hour: "numeric" })`)).toBe(true)
    expect(caught(`new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d)`)).toBe(true)
    expect(caught(`!new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12`)).toBe(true)
    expect(caught(`import { format } from "date-fns"\nformat(d, "h:mm a")`)).toBe(true)
    expect(caught(`import { format } from "date-fns"\nformat(new Date(2000, 0, 1, h), "h a")`)).toBe(true)
    expect(caught("const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, \"0\")}:${String(d.getMinutes()).padStart(2, \"0\")}`")).toBe(true)
    expect(caught(`out.push({ label: "Later today, 5:00 PM", at })`)).toBe(true)
    expect(caught(`<p>It resets at 00:00.</p>`)).toBe(true)
    expect(caught(`{clockTime(now).replace(/\\s?[AP]M$/i, "")}`)).toBe(true)
    // What stays: a machine stamp, a zone's hour read for arithmetic, a duration, a date.
    expect(caught(`import { format } from "date-fns"\nformat(d, "yyyy-MM-dd'T'HH:mm")`)).toBe(false)
    expect(caught(`new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).formatToParts(d)`)).toBe(false)
    expect(caught("return `${m}:${String(s % 60).padStart(2, \"0\")}`")).toBe(false)
    expect(caught(`import { format } from "date-fns"\nformat(d, "EEE d MMM")`)).toBe(false)
  })

  it("follows the reader: tests run in an American locale (vitest.config.ts), where Home's standup reads 9:15 AM", () => {
    expect(clockTime(new Date(2026, 9, 12, 9, 15))).toBe("9:15\u00a0AM")
  })
})
