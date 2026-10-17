import type { ElementType } from "react"

import { AlertTriangle, Calendar, CheckSquare, FileText, Lightbulb, ListTodo, Megaphone, Rocket, RotateCcw, Users } from "@/lib/icons"
import { isCampHue, type CampHue } from "@/lib/campHue"

/**
 * OneCamp's own doc templates, as the browser needs them to offer one: its
 * id, name and tile. Their bodies are the server's (the API's
 * business/Marketplace/docTemplatesBuiltin.go), which writes one as it makes
 * the doc, or into an empty doc: never the browser after the doc has opened,
 * where two tabs each laid it in (N37). The ids are fixed on both sides; a
 * workspace's own templates come from the gallery's list.
 */
interface BuiltinDocTemplate {
  id: string
  name: string
  description: string
  hue: CampHue
  glyph: string
  category: string
}

/** In the gallery's order, which the server lists them in too. */
export const BUILTIN_DOC_TEMPLATES: BuiltinDocTemplate[] = [
  { id: "b5d0c000-0000-4000-8000-000000000001", name: "Meeting notes", description: "Who came, what was decided, and who does what next.", hue: "sky", glyph: "list-todo", category: "Meetings" },
  { id: "b5d0c000-0000-4000-8000-000000000002", name: "Project brief", description: "Why it matters, what ships, who owns it and when.", hue: "sun", glyph: "file-text", category: "Planning" },
  { id: "b5d0c000-0000-4000-8000-000000000003", name: "Decision record", description: "The options, the call, and what follows from it.", hue: "dusk", glyph: "check-square", category: "Decisions" },
  { id: "b5d0c000-0000-4000-8000-000000000004", name: "Weekly update", description: "What moved this week, what's next and what's stuck.", hue: "moss", glyph: "calendar", category: "Updates" },
  { id: "b5d0c000-0000-4000-8000-000000000005", name: "RFC", description: "A proposal for a change that's hard to undo, open for review.", hue: "lake", glyph: "lightbulb", category: "Engineering" },
  { id: "b5d0c000-0000-4000-8000-000000000006", name: "Retrospective", description: "What went well, what didn't, and what to try next.", hue: "berry", glyph: "rotate-ccw", category: "Meetings" },
  { id: "b5d0c000-0000-4000-8000-000000000007", name: "One-to-one", description: "A running page for two people who meet regularly.", hue: "lake", glyph: "users", category: "Meetings" },
  { id: "b5d0c000-0000-4000-8000-000000000008", name: "Incident review", description: "What happened, when, and what changes now. Blameless.", hue: "berry", glyph: "alert-triangle", category: "Engineering" },
  { id: "b5d0c000-0000-4000-8000-000000000009", name: "Onboarding guide", description: "A new teammate's first two weeks, as a checklist.", hue: "moss", glyph: "rocket", category: "Teams" },
  { id: "b5d0c000-0000-4000-8000-00000000000a", name: "Release notes", description: "What's new, better and fixed, for the people who use it.", hue: "sun", glyph: "megaphone", category: "Updates" },
]

/** The three a new doc offers first, before "More templates". */
export const QUICK_DOC_TEMPLATES = BUILTIN_DOC_TEMPLATES.slice(0, 3)

const GLYPHS: Record<string, ElementType> = {
  "list-todo": ListTodo,
  "file-text": FileText,
  "check-square": CheckSquare,
  calendar: Calendar,
  lightbulb: Lightbulb,
  "rotate-ccw": RotateCcw,
  users: Users,
  "alert-triangle": AlertTriangle,
  rocket: Rocket,
  megaphone: Megaphone,
}

/** A template's glyph by its name; the page for one this app doesn't know. */
export function templateGlyph(name: string | undefined): ElementType {
  return (name && GLYPHS[name]) || FileText
}

/** A template's tile hue, or sky for one stored without a camp hue. */
export function templateHue(hue: string | undefined): CampHue {
  return isCampHue(hue) ? hue : "sky"
}
