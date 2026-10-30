/**
 * A visitor's answers checked as business/Form's CheckAnswers checks them,
 * in its words, so the page says what's wrong at the question before
 * anything is sent. A number is read in the reader's own signs, as the
 * server reads it in the signs the page sends (services/formService). Pure,
 * but for the reader's locale.
 */

import { parseTypedNumber } from "@/lib/format/number"
import type { FormField } from "@/lib/forms/forms"
import { kept, shown, type Answers, type Kept } from "@/lib/forms/branch"
import { webURL } from "@/lib/links/webURL"

/** How many files a file question takes (business/Form maxFilesPerQuestion). */
export const MAX_FILES = 5

const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The longest answer each kind takes, in characters. */
export const answerLimit = (type: FormField["type"]) => (type === "long_text" ? 5000 : type === "url" ? 2000 : 300)

/** Characters, as the server counts them (runes), not UTF-16 units. */
const length = (s: string) => [...s].length

/** A phone number as people write one: digits, spaces and + - ( ) . /, with 5 to 20 digits. */
export function isPhone(s: string): boolean {
  if (length(s) > 30) return false
  let digits = 0
  for (const ch of s) {
    if (/\p{Nd}/u.test(ch)) digits++
    else if (!" +-()./".includes(ch)) return false
  }
  return digits >= 5 && digits <= 20
}

/** A day written yyyy-mm-dd that the calendar has. */
function isDay(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

/** What the server says is wrong with one shown question's answer, or "". */
export function answerProblem(f: FormField, v: unknown, locale?: string): string {
  const q = `“${f.label}”`
  const present = v !== undefined && v !== null
  if (f.type === "checkbox") return f.required && v !== true ? `${q} needs to be ticked.` : ""
  if (f.type === "file") {
    // The ids of the visitor's uploads, each once.
    if (present && !Array.isArray(v)) return `${q} isn't answered the right way.`
    const list: unknown[] = present ? (v as unknown[]) : []
    if (list.some((x) => typeof x !== "string" || !UPLOAD_ID.test(x))) return `${q} isn't answered the right way.`
    const ids = new Set(list as string[])
    if (!ids.size) return f.required ? `${q} needs a file.` : ""
    return ids.size > MAX_FILES ? `Add at most ${MAX_FILES} files to ${q}.` : ""
  }
  if (f.type === "multi_select") {
    if (present && !Array.isArray(v)) return `${q} isn't answered the right way.`
    const list: unknown[] = present ? (v as unknown[]) : []
    if (list.some((x) => typeof x !== "string" || !(f.options ?? []).includes(x))) return `Pick from the choices for ${q}.`
    return !list.length && f.required ? `${q} needs an answer.` : ""
  }
  let s = ""
  if (present) {
    if (typeof v === "string") s = v.trim()
    else if (typeof v === "number") s = String(v)
    else return `${q} isn't answered the right way.`
  }
  if (!s) return f.required ? `${q} needs an answer.` : ""
  const limit = answerLimit(f.type)
  if (length(s) > limit) return `Keep ${q} under ${limit} characters.`
  switch (f.type) {
    case "email": {
      const at = s.lastIndexOf("@")
      return at > 0 && /^[^\s@]+@[^\s@]+$/.test(s) && s.slice(at + 1).includes(".") ? "" : `${q} needs an email address like name@example.com.`
    }
    case "number":
      return parseTypedNumber(s, locale) === null ? `${q} needs a number.` : ""
    case "date":
      return isDay(s) ? "" : `${q} needs a date.`
    case "select":
      return (f.options ?? []).includes(s) ? "" : `Pick one of the choices for ${q}.`
    case "url":
      return webURL(s) ? "" : `${q} needs a link that starts with https://.`
    case "phone":
      return isPhone(s) ? "" : `${q} needs a phone number.`
  }
  return ""
}

export interface Problem {
  id: string
  message: string
  /** It's missing: a required answer left blank, or a required box left unticked. */
  required?: true
}

/** Whether a required question was left unanswered (or a required box unticked). */
function missing(f: FormField, v: unknown): boolean {
  if (!f.required) return false
  if (f.type === "checkbox") return v !== true
  if (f.type === "multi_select" || f.type === "file") return !Array.isArray(v) || v.length === 0
  return typeof v === "string" ? !v.trim() : v === undefined || v === null
}

const problemOf = (f: FormField, v: unknown, message: string): Problem => (missing(f, v) ? { id: f.id, message, required: true } : { id: f.id, message })

/** The first of these questions whose answer the server would refuse, with its words. */
export function firstProblem(questions: FormField[], answers: Answers, locale?: string): Problem | null {
  for (const f of questions) {
    if (f.type === "section") continue
    const message = answerProblem(f, answers[f.id], locale)
    if (message) return problemOf(f, answers[f.id], message)
  }
  return null
}

/** CheckAnswers' twin: what the server keeps of the shown answers, in order, or the first it refuses. */
export function checkAnswers(fields: FormField[], answers: Answers, locale?: string): { kept: (Kept & { id: string; label: string })[]; problem: Problem | null } {
  const out: (Kept & { id: string; label: string })[] = []
  for (const f of shown(fields, answers).items) {
    if (f.type === "section") continue
    const message = answerProblem(f, answers[f.id], locale)
    if (message) return { kept: out, problem: problemOf(f, answers[f.id], message) }
    const k = kept(f, answers[f.id])
    if (k) out.push({ id: f.id, label: f.label, ...k })
  }
  return { kept: out, problem: null }
}
