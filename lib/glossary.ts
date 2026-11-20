/**
 * The one word for each thing people meet in OneCamp, and the words it
 * retired (UX-PROGRAM foundation 7). app/glossaryGuard.test.ts fails a retired
 * word in anything a person reads (JSX text, strings, aria-labels, the English
 * messages) beyond each file's baseline, which only goes down as the owner
 * renames. Tests import this file and product code doesn't, so it costs no
 * page anything.
 *
 * Adding a word: one row, in term order. `retired` words are whole words,
 * matched case and all. `allowIn` names the path prefixes where a retired word
 * keeps another meaning; `only` the prefixes where it is retired, when it
 * means something else everywhere else. A word only one edition says goes in
 * that edition's own file beside this one, which the other edition leaves out
 * (AI_ONLY in lib/editionBoundary.test.ts): every edition carries this file.
 */

export type Owner = "SHELL" | "CHAT" | "CALLS" | "DOCS" | "PROJECTS" | "CALPLAN" | "TB" | "ADMIN" | "IA" | "DS"

export interface GlossaryRow {
  /** The one word people see: "Linked". */
  term: string
  /** What it means, in one line. */
  means: string
  /** Whole words, case-sensitive, that no visible copy may say any more. */
  retired?: readonly string[]
  /** Path prefixes where a retired word keeps another meaning. */
  allowIn?: readonly string[]
  /** Path prefixes where the retired words are retired, when they mean something else everywhere else. */
  only?: readonly string[]
  /** The area that renames its uses and lowers the baseline. */
  owner: Owner
}

// prettier-ignore
export const GLOSSARY: readonly GlossaryRow[] = [
  { term: "Copy link", means: "copy the link a member opens", retired: ["Copy doc link"], owner: "DOCS" },
  { term: "Copy public link", means: "copy the link anyone can open", owner: "DOCS" },
  { term: "Inbox", means: "where what needs you lands in the app; mail is \"emailed to you\"", retired: ["reaches your inbox"], owner: "IA" },
  { term: "Join", means: "the button that enters a call", retired: ["Ready to join?"], owner: "CALLS" },
  { term: "Linked", means: "the work tied to this thing: tasks, docs, projects, whiteboards and events", retired: ["Connected"], only: ["components/workGraph/", "lib/workGraph/", "components/channel/chanelIdDesktop.tsx", "components/docEditor/DocHeader.tsx"], owner: "DS" },
  { term: "Linked from", means: "the docs, tasks and projects that link to this doc", retired: ["backlink", "backlinks", "Backlink", "Backlinks"], owner: "DOCS" },
  { term: "Meeting notes", means: "what a recorded call leaves: the recording, its transcript and summary", retired: ["Recordings"], owner: "CALLS" },
  { term: "Move to trash", means: "delete, with time to restore it", owner: "DOCS" },
  { term: "Rename", means: "change a thing's name", retired: ["Edit doc title"], owner: "DOCS" },
  { term: "Reply here", means: "answer a message in the same conversation, quoting it", retired: ["Reply with quote"], owner: "CHAT" },
  { term: "Reply in thread", means: "answer a message in its thread", owner: "CHAT" },
  { term: "Sensitivity", means: "how private a doc or board is; never just \"label\" (renamed by hand: the word is too wide to match)", owner: "DOCS" },
  { term: "Standups", means: "a channel's questions on a schedule; a goal's check-in keeps its name", retired: ["Check-in", "Check-ins"], allowIn: ["components/goals/"], owner: "CALPLAN" },
  { term: "Star", means: "keep a thing in your sidebar", owner: "DOCS" },
  { term: "Unstar", means: "take a thing out of your sidebar", retired: ["Remove from starred"], owner: "DOCS" },
  { term: "Whiteboards", means: "the drawing tool, by its name", retired: ["Boards"], owner: "TB" },
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
type Compiled = { row: GlossaryRow; word: string; re: RegExp }[]
/** Each rows list's retired words as patterns, compiled once per list. */
const compiled = new WeakMap<readonly GlossaryRow[], Compiled>()
const words = (rows: readonly GlossaryRow[]): Compiled => {
  let out = compiled.get(rows)
  if (!out) {
    out = rows.flatMap((row) =>
      (row.retired ?? []).map((word) => ({ row, word, re: new RegExp(`(?<![\\p{L}\\p{N}_])${escape(word)}(?![\\p{L}\\p{N}_])`, "gu") })),
    )
    compiled.set(rows, out)
  }
  return out
}

const under = (file: string, prefixes: readonly string[]) => prefixes.some((p) => file.startsWith(p))

/**
 * Each retired word in `text`, once per time it is said, with the term that
 * replaces it. `file` (a repo path) applies the rows' allowIn and only.
 * `rows` is the edition's glossary: GLOSSARY, plus the rows of a file one
 * edition alone carries.
 */
export function retiredIn(text: string, file?: string, rows: readonly GlossaryRow[] = GLOSSARY): { word: string; term: string }[] {
  const out: { word: string; term: string }[] = []
  for (const { row, word, re } of words(rows)) {
    if (!text.includes(word)) continue
    if (file !== undefined && row.allowIn && under(file, row.allowIn)) continue
    if (row.only && (file === undefined || !under(file, row.only))) continue
    out.push(...Array.from(text.matchAll(re), () => ({ word, term: row.term })))
  }
  return out
}
