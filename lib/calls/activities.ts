// A call's polls and questions on this side (calls package A, "Ask the room":
// meet-10, zoom-02): what the server answers (business/CallControl's
// Activities), what may be asked of it, and the checks a form makes before it
// asks, which are the server's own (business/Poll's Normalize, business/CallQA's
// Text), so a form never sends what the server refuses. Pure, and the panel's
// alone: none of it rides on a call's first load.

/** A call's poll as one person in it reads it (business/Poll's CallView). */
export interface CallPollView {
  id: string
  question: string
  multiple: boolean
  options: { id: string; text: string; votes: number }[]
  /** How many voted; 0 while its results are held back from you. */
  voters: number
  /** Your own choices, which are yours to see even in an anonymous poll. */
  mine: string[]
  closed: boolean
  /** Whether you run the call's activities, so may close it. */
  can_close: boolean
  /** Nobody, whoever runs the call included, can tell whose its votes are. */
  anonymous?: boolean
  /** Its counts are for whoever runs the call until they share them. */
  results_hidden?: boolean
}

export type QuestionState = "open" | "answered" | "dismissed"

/** A call's question as one person in it reads it (business/CallQA's View). */
export interface CallQuestionView {
  id: string
  text: string
  /** Who asked, by name: never there for an anonymous question. */
  asker?: string
  anonymous?: boolean
  /** Your own question, anonymous or not. */
  yours?: boolean
  votes: number
  voted?: boolean
  state: QuestionState
  pinned?: boolean
  at: string
}

/** How a call's Q&A works: open or not, which questions people see, anonymous asks. */
export interface CallQA {
  open: boolean
  shown: "all" | "answered"
  anonymous: boolean
}

/** A call's polls and questions as one person in it reads them. */
export interface CallActivities {
  polls: CallPollView[]
  questions: CallQuestionView[]
  qa: CallQA
  /** Whether you run them: start and close polls, share results, run Q&A. */
  runs: boolean
}

/** A poll as whoever runs the call starts it. */
export interface PollDraft {
  question: string
  options: string[]
  multiple: boolean
  anonymous: boolean
  hide_results: boolean
}

/** One thing asked of a call's activities (business/CallControl's Activity). */
export type Activity =
  | { op: "poll"; poll: PollDraft }
  | { op: "close_poll"; id: string }
  | { op: "share_results"; id: string }
  | { op: "vote"; id: string; options: string[] }
  | { op: "qa"; qa: CallQA }
  | { op: "ask"; text: string; anonymous: boolean }
  | { op: "upvote"; id: string; on: boolean }
  | { op: "question"; id: string; state?: QuestionState; pinned?: boolean }

/** The server's caps (business/Poll, business/CallQA). */
export const MAX_POLL_QUESTION = 300
export const MAX_OPTION = 100
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 10
export const MAX_QUESTION = 300

const runes = (s: string) => [...s].length

/** A draft's options as the server keeps them: trimmed, no blanks, no repeats in any case. Pure. */
export function pollOptions(options: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of options) {
    const o = raw.trim()
    if (!o || seen.has(o.toLowerCase())) continue
    seen.add(o.toLowerCase())
    out.push(o)
  }
  return out
}

/** What stops a draft poll being started, in a sentence, or null. Pure. */
export function pollProblem(d: Pick<PollDraft, "question" | "options">): string | null {
  const question = d.question.trim()
  if (!question) return "Write the question first."
  if (runes(question) > MAX_POLL_QUESTION) return `Keep the question under ${MAX_POLL_QUESTION} characters.`
  if (d.options.some((o) => runes(o.trim()) > MAX_OPTION)) return `Keep each option under ${MAX_OPTION} characters.`
  const options = pollOptions(d.options)
  if (options.length < MIN_OPTIONS) return "Give at least two different options."
  if (options.length > MAX_OPTIONS) return `A poll can have at most ${MAX_OPTIONS} options.`
  return null
}

/** What stops a question being asked, in a sentence, or null. Pure. */
export function questionProblem(text: string): string | null {
  const t = text.trim()
  if (!t) return "Write your question first."
  if (runes(t) > MAX_QUESTION) return `Keep a question under ${MAX_QUESTION} characters.`
  return null
}

/**
 * The questions a reader sees, in the server's order (pinned, then by
 * upvotes, then oldest), split into what's still to answer and what's been
 * answered, as Meet's and Zoom's Q&A lists split them. Pure.
 */
export function questionGroups(questions: readonly CallQuestionView[]): { open: CallQuestionView[]; answered: CallQuestionView[] } {
  return {
    open: questions.filter((q) => q.state !== "answered"),
    answered: questions.filter((q) => q.state === "answered"),
  }
}
