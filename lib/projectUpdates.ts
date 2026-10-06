/**
 * Project updates (business/ProjectUpdate on the server): where a project
 * stands, and a short note in plain text. Pure helpers, for their test.
 */
import { daysSince } from "@/lib/utils/relativeTime"

export type Health = "on_track" | "at_risk" | "off_track" | "on_hold" | "done"

export interface ProjectUpdate {
  id: string
  project_uuid: string
  author_uuid: string
  author_name: string
  health: Health
  body: string
  shared_with_client: boolean
  created_at: string
  updated_at: string
}

export interface UpdateDraft {
  text: string
  health: Health
  since: string
  /** On the AI edition's draft: whether the AI wrote a summary on top. */
  ai?: boolean
}

/** Each health, in the order a picker offers them, with its meaning's colour. */
export const HEALTHS: { value: Health; label: string; dot: string; pill: string }[] = [
  { value: "on_track", label: "On track", dot: "bg-success", pill: "bg-success/10 text-success" },
  { value: "at_risk", label: "At risk", dot: "bg-warning", pill: "bg-warning/12 text-warning" },
  { value: "off_track", label: "Off track", dot: "bg-destructive", pill: "bg-destructive/10 text-destructive" },
  { value: "on_hold", label: "On hold", dot: "bg-muted-foreground", pill: "bg-muted text-muted-foreground" },
  { value: "done", label: "Done", dot: "bg-info", pill: "bg-info/10 text-info" },
]

export const healthOf = (h: string) => HEALTHS.find((x) => x.value === h) ?? HEALTHS[0]

/** An update's text as blocks to render: paragraphs (lines) and lists. Mirrors ToHTML on the server. */
export type TextBlock = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] }

const BULLET = /^\s*(?:[-*]|•)\s+(.*)$/

export function textBlocks(body: string): TextBlock[] {
  const out: TextBlock[] = []
  const normal = body.replace(/\r\n?/g, "\n").trim()
  if (!normal) return out
  for (const block of normal.split(/\n\s*\n/)) {
    let para: string[] = []
    let list: string[] | null = null
    const flushPara = () => {
      if (para.length) out.push({ kind: "p", lines: para })
      para = []
    }
    const flushList = () => {
      if (list) out.push({ kind: "ul", items: list })
      list = null
    }
    for (const raw of block.split("\n")) {
      const line = raw.trimEnd()
      if (!line.trim()) continue
      const m = BULLET.exec(line)
      if (m) {
        flushPara()
        ;(list ??= []).push(m[1].trim())
      } else {
        flushList()
        para.push(line.trim())
      }
    }
    flushList()
    flushPara()
  }
  return out
}

/** A project's admins are reminded once its last update is a week old. */
export const UPDATE_DUE_DAYS = 7

/** Whether an update is due: none yet, or the newest is a week old. */
export function updateDue(latest: ProjectUpdate | undefined, now: number): boolean {
  return !latest || daysSince(latest.created_at, now) >= UPDATE_DUE_DAYS
}
