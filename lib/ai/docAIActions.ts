/**
 * The doc AI bar's actions (docs programme B9; AI edition only): what each is
 * called, what it needs, and which the bar offers where it was opened. The
 * server's list is business/AI docAI.go; the names here are the same.
 *
 * Three kinds, as on the server: a transform rewrites the selection and is
 * reviewed as a change (A9's proposals); a write adds text at the caret as
 * ghost text until it is accepted; an answer is read in the bar. "Find action
 * items" makes tasks, its own flow.
 */

export type DocAIKind = "transform" | "write" | "answer" | "tasks"

export type DocAIActionId =
  | "edit"
  | "improve"
  | "fix"
  | "shorter"
  | "longer"
  | "tone"
  | "translate"
  | "simplify"
  | "explain"
  | "summarize"
  | "continue"
  | "write"
  | "draft"
  | "draft_from_tasks"
  | "ask"
  | "action_items"

export interface DocAIActionDef {
  id: DocAIActionId
  label: string
  kind: DocAIKind
  /** More words the bar's field finds it by. */
  keywords: string[]
  /** It opens a list of its own (tones, languages). */
  submenu?: "tone" | "language"
}

const def = (id: DocAIActionId, label: string, kind: DocAIKind, keywords: string[], submenu?: DocAIActionDef["submenu"]): DocAIActionDef => ({
  id,
  label,
  kind,
  keywords,
  ...(submenu ? { submenu } : {}),
})

export const DOC_AI_ACTIONS: Record<DocAIActionId, DocAIActionDef> = {
  // What a typed instruction does to a selection ("make it a table").
  edit: def("edit", "Edit with AI", "transform", ["edit", "change", "rewrite"]),
  improve: def("improve", "Improve writing", "transform", ["rewrite", "better", "clearer", "polish", "edit"]),
  fix: def("fix", "Fix spelling and grammar", "transform", ["spelling", "grammar", "typos", "proofread", "correct"]),
  shorter: def("shorter", "Make shorter", "transform", ["shorten", "concise", "trim", "cut"]),
  longer: def("longer", "Make longer", "transform", ["expand", "lengthen", "elaborate", "detail"]),
  tone: def("tone", "Change tone", "transform", ["tone", "voice", "formal", "casual", "friendly", "professional", "confident", "direct"], "tone"),
  translate: def("translate", "Translate", "transform", ["translate", "language", "french", "spanish", "german", "japanese"], "language"),
  simplify: def("simplify", "Simplify language", "transform", ["simple", "plain", "easier", "jargon"]),
  explain: def("explain", "Explain", "answer", ["explain", "what does this mean", "meaning"]),
  summarize: def("summarize", "Summarise", "write", ["summary", "summarise", "summarize", "tldr", "recap"]),
  continue: def("continue", "Continue writing", "write", ["continue", "keep going", "next", "more"]),
  write: def("write", "Write", "write", ["write", "draft", "generate"]),
  draft: def("draft", "Draft", "write", ["draft", "write", "outline"]),
  draft_from_tasks: def("draft_from_tasks", "Draft from this project's open tasks", "write", ["tasks", "project", "plan", "draft"]),
  ask: def("ask", "Ask about this doc", "answer", ["ask", "question", "what", "when", "who", "why", "how"]),
  action_items: def("action_items", "Find action items", "tasks", ["action items", "tasks", "todo", "to-do", "follow-ups"]),
}

/** The tones "Change tone" offers, as the server names them. */
export const DOC_AI_TONES = [
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "direct", label: "Direct" },
  { id: "confident", label: "Confident" },
  { id: "friendly", label: "Friendly" },
] as const

/** The languages "Translate" offers first; any other can be typed. */
export const DOC_AI_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Dutch",
  "Hindi",
  "Japanese",
  "Korean",
  "Chinese (Simplified)",
  "Arabic",
] as const

/** Where the bar was opened, as far as its offer depends on it. */
export interface DocAIPlace {
  /** Text or blocks are selected. */
  hasSelection: boolean
  /**
   * Blocks chosen apart (the block menu's): they are read alone, and an
   * answer goes below them, but nothing is written into them, since one
   * answer can't say which of them each part belongs to.
   */
  scattered?: boolean
  /** The doc holds nothing yet. */
  docEmpty: boolean
  /** The doc is in a project the person is in, with open tasks. */
  projectTasks?: boolean
}

/**
 * What the bar offers, in its groups: with a selection, ways to change it and
 * to ask about it; at a caret, ways to go on, and whole-doc actions; in an
 * empty doc, ways to start. "Ask about this doc" ends the list wherever there
 * is something to ask about: it readies the field for a question. Pure.
 */
export function offerFor(place: DocAIPlace): Array<{ group: string; actions: DocAIActionDef[] }> {
  const a = DOC_AI_ACTIONS
  if (place.scattered) return [{ group: "Ask", actions: [a.explain, a.summarize, a.ask] }]
  if (place.hasSelection) {
    return [
      { group: "Edit", actions: [a.improve, a.fix, a.shorter, a.longer, a.simplify, a.tone, a.translate] },
      { group: "Ask", actions: [a.explain, a.summarize, a.ask] },
    ]
  }
  if (place.docEmpty) {
    return [{ group: "Start", actions: place.projectTasks ? [a.draft_from_tasks] : [] }].filter((g) => g.actions.length > 0)
  }
  return [
    { group: "Write", actions: [a.continue, a.summarize, a.action_items] },
    { group: "This doc", actions: [{ ...a.translate, label: "Translate this doc" }, a.ask] },
  ]
}

/**
 * How an action's answer is given to this person: the action's own kind for
 * someone who can change the doc; for someone who can't, a write (a summary)
 * is read in the bar, as an answer is, and nothing goes into the doc. The one
 * place that decides it: the bar's offer (readerOffer) and the run
 * (docAiRun runAction) both ask it. A transform is never a reader's: the
 * offer leaves it out, and the server refuses it below edit. Pure.
 */
export function outputKind(id: DocAIActionId, canChange: boolean): DocAIKind {
  const kind = DOC_AI_ACTIONS[id]?.kind ?? "write"
  return !canChange && kind === "write" ? "answer" : kind
}

/**
 * A reader's offer (docs incident, 14 Oct 2026): what is answered in the bar
 * for them (outputKind) and the server runs for view (GET /ai/status
 * doc_action_needs), never what changes the doc. All of it is asking, so it
 * comes under one heading, Ask: a summary at the caret is read, not written,
 * and "Write" over it would say otherwise. With no list from the server,
 * nothing. Pure.
 */
export function readerOffer(groups: Array<{ group: string; actions: DocAIActionDef[] }>, needs: Record<string, string> | null) {
  const actions = groups.flatMap((g) => g.actions.filter((a) => outputKind(a.id, false) === "answer" && needs?.[a.id] === "view"))
  return actions.length > 0 ? [{ group: "Ask", actions }] : []
}

/**
 * The offer narrowed to what was typed: an action whose name or words start a
 * word of the query, in their order. Pure.
 */
export function matchOffer(groups: Array<{ group: string; actions: DocAIActionDef[] }>, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return groups
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const hit = (a: DocAIActionDef) => {
    const hay = [...words(a.label), ...a.keywords.flatMap(words)]
    return q.split(/\s+/).every((part) => hay.some((w) => w.startsWith(part)))
  }
  return groups.map((g) => ({ ...g, actions: g.actions.filter(hit) })).filter((g) => g.actions.length > 0)
}

/** What the bar says while an action works, before its first word. */
export function workingLabel(id: DocAIActionId): string {
  switch (id) {
    case "edit":
    case "improve":
    case "simplify":
    case "tone":
      return "Rewriting"
    case "fix":
      return "Checking spelling and grammar"
    case "shorter":
      return "Shortening"
    case "longer":
      return "Lengthening"
    case "translate":
      return "Translating"
    case "explain":
      return "Explaining"
    case "summarize":
      return "Summarising"
    case "ask":
      return "Reading the doc"
    case "action_items":
      return "Finding action items"
    default:
      return "Writing"
  }
}

/** A model as the bar names it. */
export interface DocAIModel {
  name: string
  label: string
  provider: string
  provider_label?: string
  local: boolean
}

/**
 * Where the text goes, said before it goes: "Runs on your server · qwen3 4B",
 * or "Sent to OpenAI · gpt-4.1-mini". Pure.
 */
export function modelLine(model: DocAIModel | null | undefined): string {
  if (!model || !model.label) return ""
  if (model.local) return `Runs on your server · ${model.label}`
  return `Sent to ${model.provider_label || "a hosted model"} · ${model.label}`
}

/** After this long without a first word, the bar says the model is still at it. */
export const STILL_WRITING_MS = 8000

/** What the bar says when a first word is slow: the kind of model sets the expectation. Pure. */
export function stillWorkingLine(model: DocAIModel | null | undefined): string {
  return model?.local ? "Still writing · local model" : "Still writing"
}

/** Whether typed words read as a question rather than something to write. Pure. */
export function isQuestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t.endsWith("?") || /^(what|when|where|who|whom|whose|why|how|which|is|are|was|were|does|do|did|can|could|should|will|would|has|have)\b/.test(t)
}

/**
 * What typed words do where the bar was opened: change the selection, answer a
 * question about the doc, draft an empty doc, or write at the caret. Pure.
 */
export function typedAction(text: string, place: { hasSelection: boolean; docEmpty: boolean; askMode: boolean; scattered?: boolean }): DocAIActionId {
  if (place.askMode || place.scattered) return "ask"
  if (place.hasSelection) return isQuestion(text) ? "ask" : "edit"
  if (isQuestion(text) && !place.docEmpty) return "ask"
  return place.docEmpty ? "draft" : "write"
}
