/**
 * A workspace's own board templates (miro-19 3): a board saved as a template
 * (components/board/saveBoardTemplate), listed on the Templates page and in
 * every board's picker under "Your team's", and laid on a board as copies
 * (lib/board/copyElements). A list carries the server's drawing of each in
 * place of its elements (business/Marketplace, listedBoardPayload); one
 * template's read carries its elements. Pure.
 */

import type { CopyableElement } from "./copyElements"
import { noteColourOfFill } from "./notes"
import type { PreviewShapes } from "./previewShapes"
import type { BoardTemplate } from "./templates"

/** The picker's kind for the workspace's own. */
export const TEAM_CATEGORY = "Your team's"

/** How large a board template may be (business/Marketplace, maxBoardPayloadBytes). */
export const BOARD_TEMPLATE_MAX_BYTES = 1 << 20

/** One shape of a listed board template's drawing (business/Marketplace, BoardShape). */
export interface ListedShape {
  type: string
  x: number
  y: number
  /** An arrow's or a line's run from its start to its end; either may be negative. */
  w: number
  h: number
  fill?: string
  note?: boolean
}

export interface ListedBoard {
  title: string
  /** How many elements a person sees on it. */
  count: number
  preview: ListedShape[]
}

/** What this reads of a template: the marketplace's row (services/marketplaceService). */
interface TemplateRow {
  id: string
  name: string
  kind?: string
  description?: string | null
  payload: string
  author_name?: string
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

function parse(payload: string): Record<string, unknown> {
  try {
    const v = JSON.parse(payload)
    return v && typeof v === "object" && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

/** A listed board template's payload, read safely: shapes it can't draw are left out. */
export function listedBoard(t: Pick<TemplateRow, "name" | "payload">): ListedBoard {
  const p = parse(t.payload)
  const preview = (Array.isArray(p.preview) ? p.preview : []).filter(
    (s): s is ListedShape => !!s && typeof s.type === "string" && isNum(s.x) && isNum(s.y) && isNum(s.w) && isNum(s.h),
  )
  return {
    title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : t.name,
    count: isNum(p.count) ? p.count : 0,
    preview,
  }
}

const LINES = new Set(["arrow", "line"])
const FRAMES = new Set(["frame", "magicframe"])

/** A listed template's drawing as the shapes a preview draws, from its top left. */
export function listedShapes(preview: readonly ListedShape[]): PreviewShapes {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const s of preview) {
    const xs = LINES.has(s.type) ? [s.x, s.x + s.w] : [s.x, s.x + Math.abs(s.w)]
    const ys = LINES.has(s.type) ? [s.y, s.y + s.h] : [s.y, s.y + Math.abs(s.h)]
    x0 = Math.min(x0, ...xs); x1 = Math.max(x1, ...xs)
    y0 = Math.min(y0, ...ys); y1 = Math.max(y1, ...ys)
  }
  const out: PreviewShapes = { notes: [], labels: [], lines: [], boxes: [], frames: [], width: 0, height: 0 }
  if (!Number.isFinite(x0)) return out
  out.width = x1 - x0
  out.height = y1 - y0
  for (const s of preview) {
    const x = s.x - x0, y = s.y - y0
    if (LINES.has(s.type)) out.lines.push({ x1: x, y1: y, x2: x + s.w, y2: y + s.h })
    else if (FRAMES.has(s.type)) out.frames.push({ x, y, w: s.w, h: s.h })
    else if (s.type === "text") out.labels.push({ x, y, w: s.w, h: s.h })
    else if (s.note) out.notes.push({ x, y, w: s.w, h: s.h, colour: noteColourOfFill(s.fill) ?? "yellow" })
    else out.boxes.push({ x, y, w: s.w, h: s.h, round: s.type === "ellipse" })
  }
  return out
}

/** A team's template as the picker offers it. */
export interface TeamBoardItem {
  /** "team:" and the template's id: what ?template= carries. */
  id: string
  templateId: string
  name: string
  description: string
  category: typeof TEAM_CATEGORY
  keywords: string
  count: number
  shapes: PreviewShapes
}

/** A template the picker offers: one of the library's, or the workspace's own. */
export type BoardPick = BoardTemplate | TeamBoardItem

/** Whether a pick is the workspace's own. */
export const isTeamPick = (t: BoardPick): t is TeamBoardItem => "templateId" in t

const TEAM = "team:"

/** The template a "team:<id>" names, or null for a built-in one's id. */
export function teamTemplateRef(id: string | null | undefined): string | null {
  return id && id.startsWith(TEAM) && id.length > TEAM.length ? id.slice(TEAM.length) : null
}

/**
 * The rows of a list that are board templates to offer: each with an id and a
 * name, and of the board kind when it says. Anything else, a body that isn't a
 * list among them (an older server's answer), offers nothing: it crashed every
 * board's picker.
 */
function boardRows(rows: unknown): TemplateRow[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(
    (t): t is TemplateRow =>
      !!t && typeof t === "object" && typeof t.id === "string" && t.id !== "" && typeof t.name === "string" && (t.kind === undefined || t.kind === "board"),
  )
}

/** A workspace's board templates as the picker offers them, from the list's rows. */
export function teamBoardItems(rows: unknown): TeamBoardItem[] {
  return boardRows(rows).map((t) => {
    const listed = listedBoard(t)
    const by = typeof t.author_name === "string" && t.author_name ? `Saved by ${t.author_name}` : "Saved by your team"
    return {
      id: `${TEAM}${t.id}`,
      templateId: t.id,
      name: t.name,
      description: (typeof t.description === "string" && t.description.trim()) || by,
      category: TEAM_CATEGORY,
      keywords: `${typeof t.author_name === "string" ? t.author_name : ""} team workspace ${listed.title}`,
      count: listed.count,
      shapes: listedShapes(listed.preview),
    }
  })
}

/** A template's elements, from one template's read: those with an id and a type. */
export function templateElementsOf(t: Pick<TemplateRow, "payload">): CopyableElement[] {
  const p = parse(t.payload)
  return (Array.isArray(p.elements) ? p.elements : []).filter(
    (e): e is CopyableElement => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.type === "string",
  )
}

/** What saving a board as a template sends, and its size against BOARD_TEMPLATE_MAX_BYTES. */
export function boardTemplatePayload<T extends CopyableElement>(title: string, elements: T[]): { payload: { title: string; elements: T[] }; bytes: number } {
  const payload = { title: title.trim(), elements }
  return { payload, bytes: new TextEncoder().encode(JSON.stringify(payload)).length }
}
