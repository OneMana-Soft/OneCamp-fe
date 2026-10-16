"use client"

/**
 * Running a doc AI action (docs programme B9; AI edition only): reading what
 * it needs from the live editor, streaming the answer, and putting it in the
 * doc the one way changes are reviewed, as an edit proposal (A9), never as a
 * flat string (N17).
 *
 * - A transform (improve, fix, tone, translate…) streams into the bar, then is
 *   shown as a word diff against the text it was asked about, wherever edits
 *   moved that text since (N43); Accept is one transaction with one undo.
 * - A write (continue, write, a summary, a draft) streams into the doc as ghost
 *   text at the caret: a proposal, so nobody else sees it, and nothing is in
 *   the doc, until it is accepted. The bar hands over to the review bar at the
 *   first word; Accept keeps what is written so far, Discard stops it.
 * - An answer (explain, ask) is read in the bar; "Insert below" makes it a
 *   proposal too. For someone who can't change the doc, a write (a summary)
 *   is an answer as well (outputKind): read in the bar, never put in the doc.
 *
 * The review bar is A9's, given this run's handlers (components/proposals/
 * reviewers.ts): it names the model, Try again and a refinement ask again, and
 * an accept is recorded (POST /doc/ai/applied: what and how much, never the
 * text). A run lives outside React: a write goes on after the bar closes.
 */

import type { Editor, JSONContent } from "@tiptap/core"
import type { Transaction } from "@tiptap/pm/state"
import { proposeReplacement, type Tracked } from "@/lib/proposals/review"
import {
  acceptProposal,
  discardProposal,
  insertProposalBelow,
  markDecided,
  proposalsKey,
  proposalsOf,
  showProposal,
} from "@/components/minimal-tiptap/extensions/proposals"
import { setReviewer, type Reviewer } from "@/components/proposals/reviewers"
import { outputKind, type DocAIActionId, type DocAIKind, type DocAIModel } from "@/lib/ai/docAIActions"
import { streamDocAI, type DocAIProgress, type DocAIRequest } from "@/lib/ai/docAIStream"
import {
  answerContent,
  docMarkdown,
  isInlineRange,
  markdownBefore,
  partsMarkdown,
  plainOf,
  rangeMarkdown,
  textAround,
  wholeLines,
  writePlace,
} from "@/lib/ai/docAIContent"
import { recordAppliedEdit } from "@/lib/ai/docAIApi"
import { sha256Hex } from "@/lib/sha256"
import { busForDoc, editorOf } from "@/components/docEditor/registry/commandBus"
import { toast } from "@/hooks/use-toast"
import { pinRange, pinnedRange, unpin } from "./docAiPlugin"
import { panelPinOf } from "./docAiStore"

export interface RunInput {
  editor: Editor
  docId: string
  action: DocAIActionId
  /** The place asked about: the selection, or the caret. */
  from: number
  to: number
  /** Blocks chosen apart, by place: read alone, never what lies between them. */
  parts?: Array<{ from: number; to: number }>
  prompt?: string
  tone?: string
  language?: string
  previous?: string
  projectId?: string
  model: DocAIModel | null
  /**
   * Whether this person may put the answer into the doc (docAbilities
   * askWrite; the bar's request). A run in an editor that isn't editable never
   * does, whatever this says. Below that, a write is read in the bar
   * (outputKind). Absent: as the editor allows.
   */
  canChange?: boolean
  /** The run went into the doc (a write's first words, a transform's diff): the bar can close. */
  onHandOver?(): void
  /** Try again and refine, from the review bar: the bar asks again, there. */
  again?(change: { from: number; to: number; previous?: string; prompt?: string }): void
}

export type RunPhase = "preparing" | "waiting" | "streaming" | "done" | "error" | "stopped"

export interface RunState {
  phase: RunPhase
  action: DocAIActionId
  kind: DocAIKind
  model: DocAIModel | null
  /** The answer so far; the clean answer once done. */
  text: string
  progress: DocAIProgress | null
  notice: string
  error: string
  startedAt: number
  /** The proposal the answer is shown as in the doc. */
  proposalId: string | null
}

export interface Run {
  readonly state: RunState
  stop(): void
  subscribe(listener: () => void): () => void
}

/** How the review bar names an AI change: "AI · qwen3 4B, on your server". Pure. */
export function reviewLabel(model: DocAIModel | null, writing = false): string {
  const head = writing ? "Writing" : "AI"
  if (!model?.label) return head
  return model.local ? `${head} · ${model.label}, on your server` : `${head} · ${model.label}, at ${model.provider_label || "a hosted model"}`
}

/** What a request reads, from the live editor. */
async function requestFor(input: RunInput): Promise<DocAIRequest> {
  const { editor, action, from, to, parts } = input
  const req: DocAIRequest = {
    action,
    doc_id: input.docId,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.tone ? { tone: input.tone } : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(input.previous ? { previous: input.previous } : {}),
    ...(input.projectId ? { project_uuid: input.projectId } : {}),
  }
  const selected = from !== to
  // What was chosen, as Markdown: the blocks chosen apart one after another.
  const chosen = () => (parts?.length ? partsMarkdown(editor, parts) : rangeMarkdown(editor, from, to))
  switch (action) {
    case "continue":
      req.context = await markdownBefore(editor, to)
      break
    case "write":
    case "draft":
      req.context = await markdownBefore(editor, from, 4000)
      break
    case "ask":
      req.doc_text = await docMarkdown(editor)
      if (selected) req.text = await chosen()
      break
    case "summarize":
    case "translate":
      if (selected) {
        req.text = await chosen()
      } else {
        req.doc_text = await docMarkdown(editor)
        req.scope = "doc"
      }
      break
    case "draft_from_tasks":
      break
    default:
      req.text = await chosen()
      req.context = parts?.length ? "" : textAround(editor.state, from, to)
  }
  return req
}

/** What a review ended with: how many of its changes went in, and the text before and after. */
export interface Outcome {
  changes: number
  of: number
  inserted: boolean
  before: string
  after: string
}

/** Records an accepted AI change, by its counts and fingerprints; says so when it couldn't be. */
async function record(docId: string, action: DocAIActionId, model: DocAIModel | null, o: Outcome) {
  try {
    await recordAppliedEdit({
      doc_uuid: docId,
      action,
      model: model?.label ?? "",
      local: !!model?.local,
      changes: o.changes,
      of: o.of,
      inserted: o.inserted,
      // No hash where the browser can't make one (a plain-http install): the record keeps the counts.
      before_hash: (await sha256Hex(o.before)) ?? "",
      after_hash: (await sha256Hex(o.after)) ?? "",
      chars: o.after.length,
    })
  } catch {
    toast({ title: "The change is in the doc, but it couldn't be recorded just now.", variant: "destructive" })
  }
}

/**
 * Calls end once, when a proposal is no longer under review, with what it
 * ended with: however it ended (Accept all; its last change accepted or
 * rejected one by one; Discard; Insert below), so "2 of 3 changes" is
 * recorded once, as it was decided. The text after is the doc's, where the
 * change went: what was accepted, not what was proposed.
 */
export function followProposal(editor: Editor, id: string, end: (o: Outcome) => void): () => void {
  let last: Tracked | undefined = proposalsOf(editor.state).active[id]
  const check = ({ transaction }: { transaction: Transaction }) => {
    const now = proposalsOf(editor.state).active[id]
    if (now) {
      last = now
      return
    }
    off()
    if (!last) return
    const meta = transaction.getMeta(proposalsKey) as { type?: string; hunks?: string[]; decision?: string } | undefined
    const open = new Set(last.proposal.hunks.filter((h) => !h.decision).map((h) => h.id))
    let changes = last.proposal.hunks.filter((h) => h.decision === "accepted").length
    if (meta?.type === "decided" && meta.decision === "accepted") changes += (meta.hunks ?? []).filter((h) => open.has(h)).length
    let after = ""
    if (changes > 0 && last.range) {
      const doc = editor.state.doc
      const from = Math.min(transaction.mapping.map(last.range.from, -1), doc.content.size)
      const to = Math.min(transaction.mapping.map(last.range.to, 1), doc.content.size)
      after = doc.textBetween(from, Math.max(from, to), "\n", " ")
    }
    const outcome: Outcome = {
      changes,
      of: last.proposal.hunks.length,
      inserted: false,
      before: plainOf(editor.state, last.proposal.base as JSONContent[] | undefined),
      after,
    }
    // After the transaction that ended it, never inside it.
    queueMicrotask(() => end(outcome))
  }
  const off = () => {
    editor.off("transaction", check)
  }
  editor.on("transaction", check)
  return off
}

/** Recorded once its review ends with something accepted; the reviewer is let go then too. */
function recordWhenDecided(editor: Editor, docId: string, id: string, action: DocAIActionId, model: () => DocAIModel | null, done: () => void) {
  followProposal(editor, id, (o) => {
    if (o.changes > 0) void record(docId, action, model(), o)
    done()
  })
}

/** Shows content as a proposal for from..to; the same id when one is shown already. */
function show(editor: Editor, id: string | null, from: number, to: number, content: JSONContent[] | import("@tiptap/pm/model").Slice): string | null {
  const tracked = proposeReplacement(editor.state, from, to, content)
  if (!tracked) return null
  const t = id ? { ...tracked, proposal: { ...tracked.proposal, id } } : tracked
  showProposal(editor, t, { focus: !id })
  return t.proposal.id
}

/** A run that ends before it starts, saying why. */
function refused(action: DocAIActionId, kind: DocAIKind, model: DocAIModel | null, error: string): Run {
  const state: RunState = { phase: "error", action, kind, model, text: "", progress: null, notice: "", error, startedAt: Date.now(), proposalId: null }
  return { state, stop: () => undefined, subscribe: () => () => undefined }
}

/**
 * Starts an action. It reads what it needs, streams the answer, and, for a
 * transform or a write, shows it in the doc for review.
 */
export function runAction(input: RunInput): Run {
  const { editor, docId, action } = input
  // How the answer is given: into the doc only for someone who may change it.
  const kind = outputKind(action, (input.canChange ?? true) && editor.isEditable)
  // One answer can't be split back into blocks chosen apart: it is read, or
  // written below them, never into them.
  if (kind === "transform" && input.parts?.length) return refused(action, kind, input.model, "Pick blocks that are next to each other to change them, or ask about these.")
  const abort = new AbortController()
  const listeners = new Set<() => void>()
  let state: RunState = {
    phase: "preparing",
    action,
    kind,
    model: input.model,
    text: "",
    progress: null,
    notice: "",
    error: "",
    startedAt: Date.now(),
    proposalId: null,
  }
  const set = (patch: Partial<RunState>) => {
    state = { ...state, ...patch }
    for (const l of [...listeners]) l()
  }

  // Where the answer goes, kept while it is written: the text asked about,
  // or, for a write, the empty line or the place after the caret's block.
  const place = kind === "write" ? writePlace(editor.state, input.from, input.to) : { from: input.from, to: input.to }
  const pin = pinRange(editor, place.from, place.to)
  let released = false
  let release = () => {}
  const finish = () => {
    if (released) return
    released = true
    release()
    unpin(editor, pin)
  }

  // Recorded when its review ends (followProposal), whichever way it ends.
  const reviewer = (writing: boolean, extra: Partial<Reviewer> = {}): Reviewer => ({
    label: reviewLabel(state.model, writing),
    onRetry: input.again
      ? () => {
          const at = pinnedRange(editor, pin) ?? place
          if (state.proposalId) discardProposal(editor, state.proposalId)
          finish()
          input.again?.({ from: kind === "write" ? input.from : at.from, to: kind === "write" ? input.to : at.to, previous: undefined, prompt: input.prompt })
        }
      : undefined,
    onRefine: input.again
      ? (text: string) => {
          const at = pinnedRange(editor, pin) ?? place
          if (state.proposalId) discardProposal(editor, state.proposalId)
          finish()
          input.again?.({ from: kind === "write" ? input.from : at.from, to: kind === "write" ? input.to : at.to, previous: state.text, prompt: text })
        }
      : undefined,
    ...extra,
  })

  let claimed: string | null = null
  let followed: string | null = null
  const claim = (id: string, writing: boolean, extra?: Partial<Reviewer>) => {
    const key = `${id}:${writing}`
    if (claimed === key) return
    claimed = key
    release()
    release = setReviewer(id, reviewer(writing, extra))
    if (followed === id) return
    followed = id
    recordWhenDecided(editor, docId, id, action, () => state.model, finish)
  }

  // A write's ghost text, shown again as it grows (at most every 120 ms).
  let shown: string | null = null
  let latest = ""
  let timer: ReturnType<typeof setTimeout> | null = null
  let drawing: Promise<void> = Promise.resolve()
  const draw = (markdown: string, final: boolean) => {
    drawing = drawing.then(async () => {
      // Stopped (an Accept mid-stream stops it first): what is in the doc stays as it is.
      const over = () => released || editor.isDestroyed || (!final && abort.signal.aborted)
      if (over()) return
      const at = pinnedRange(editor, pin)
      if (!at) return
      const content = await answerContent(editor.state, markdown, false)
      if (over()) return
      const id = show(editor, shown, at.from, at.to, content as JSONContent[])
      if (!id) return
      if (!shown) {
        shown = id
        set({ proposalId: id })
        input.onHandOver?.()
      }
      claim(id, !final, {
        // Accept keeps what is written so far; Discard stops it too.
        accept: (ed, pid, ids) => {
          abort.abort()
          return acceptProposal(ed, pid, ids)
        },
        decline: (ed, pid, ids) => {
          abort.abort()
          if (ids) markDecided(ed, pid, ids, "declined")
          else {
            discardProposal(ed, pid)
            finish()
          }
        },
      })
    })
  }
  const grow = (text: string) => {
    latest = text
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      draw(latest, false)
    }, shown ? 120 : 0)
  }

  void (async () => {
    let req: DocAIRequest
    try {
      req = await requestFor(input)
    } catch {
      finish()
      set({ phase: "error", error: "The doc couldn't be read just now. Try again in a moment." })
      return
    }
    if (abort.signal.aborted) {
      finish()
      set({ phase: "stopped" })
      return
    }
    set({ phase: "waiting" })
    const result = await streamDocAI(
      req,
      {
        onModel: (model) => set({ model }),
        onProgress: (progress) => set({ progress }),
        onText: (text) => {
          set({ phase: "streaming", text })
          if (kind === "write") grow(text)
        },
        onNotice: (notice) => set({ notice }),
      },
      abort.signal,
    )
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (result.stopped) {
      // Stopped from the review bar keeps what Accept took; from the bar, nothing.
      if (!shown) finish()
      set({ phase: "stopped" })
      return
    }
    if (result.error) {
      if (shown && !editor.isDestroyed) discardProposal(editor, shown)
      finish()
      set({ phase: "error", error: result.error })
      if (shown) toast({ title: result.error, variant: "destructive" })
      return
    }
    set({ text: result.text, notice: result.notice })
    if (kind === "write") {
      draw(result.text, true)
      await drawing
      set({ phase: "done" })
      return
    }
    if (kind === "transform") {
      const at = pinnedRange(editor, pin)
      if (!at || at.from === at.to) {
        finish()
        set({ phase: "error", error: "The text you asked about isn't in the doc any more." })
        return
      }
      const content = await answerContent(editor.state, result.text, isInlineRange(editor.state, at.from, at.to))
      // Blocks for whole lines take the lines' place, leaving no empty line around them.
      const target = Array.isArray(content) ? wholeLines(editor.state, at.from, at.to) : at
      const id = show(editor, null, target.from, target.to, content)
      if (!id) {
        finish()
        set({ phase: "error", error: "The answer is the same as your text." })
        return
      }
      set({ proposalId: id, phase: "done" })
      claim(id, false, {
        // The text changed under it: the answer goes in below, recorded as such.
        insertBelow: (ed, pid) => {
          const tracked = proposalsOf(ed.state).active[pid]
          const ok = insertProposalBelow(ed, pid)
          if (ok && tracked) void record(docId, action, state.model, insertedOutcome(ed, tracked))
          return ok
        },
      })
      input.onHandOver?.()
      return
    }
    // An answer: read in the bar, nothing in the doc.
    finish()
    set({ phase: "done" })
  })()

  return {
    get state() {
      return state
    },
    stop() {
      abort.abort()
      if (!shown) finish()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * An answer from the bar put in the doc below what it was about (or at the
 * caret), as a proposal: reviewed and recorded like any AI change.
 */
export async function insertAnswer(editor: Editor, docId: string, action: DocAIActionId, model: DocAIModel | null, markdown: string, from: number, to: number): Promise<boolean> {
  const at = writePlace(editor.state, from, to)
  const content = await answerContent(editor.state, markdown, false)
  const id = show(editor, null, at.from, at.to, content as JSONContent[])
  if (!id) return false
  const release = setReviewer(id, { label: reviewLabel(model) })
  followProposal(editor, id, (o) => {
    if (o.changes > 0) void record(docId, action, model, { ...o, inserted: true })
    release()
  })
  return true
}

/** "Insert below": the whole answer went in under the text it was about. */
function insertedOutcome(editor: Editor, tracked: Tracked): Outcome {
  const of = tracked.proposal.hunks.length
  return {
    changes: of,
    of,
    inserted: true,
    before: plainOf(editor.state, tracked.proposal.base as JSONContent[] | undefined),
    after: plainOf(editor.state, tracked.proposal.proposed as JSONContent[]),
  }
}

// The AI panel's answer (N17, N43)

/** Where the AI panel works: the text it was opened on, wherever edits moved it (its pin), else the selection. */
function panelPlace(editor: Editor): { from: number; to: number } {
  const pin = panelPinOf(editor)
  return (pin && pinnedRange(editor, pin)) || { from: editor.state.selection.from, to: editor.state.selection.to }
}

/** What the AI panel's action reads, from the live doc; null when the doc isn't open here. */
export async function panelRequest(
  docId: string,
  action: DocAIActionId,
  extra: { prompt?: string; previous?: string; tone?: string; language?: string } = {},
): Promise<DocAIRequest | null> {
  const editor = editorOf(busForDoc(docId))
  if (!editor || editor.isDestroyed) return null
  const at = panelPlace(editor)
  return requestFor({ editor, docId, action, from: at.from, to: at.to, model: null, ...extra })
}

/**
 * Puts the AI panel's answer in its doc as a proposal: in place of the text it
 * was opened on ("replace"), wherever edits moved that text since, or below it
 * ("insert"). Accept is one transaction, so ⌘Z undoes it, with no undo of the
 * panel's own (N43). "gone" when the doc isn't open here to change.
 */
export async function applyFromPanel(
  docId: string,
  markdown: string,
  mode: "replace" | "insert",
  action: DocAIActionId,
  model: DocAIModel | null,
): Promise<"shown" | "same" | "gone"> {
  const editor = editorOf(busForDoc(docId))
  if (!editor || editor.isDestroyed || !editor.isEditable) return "gone"
  const at = panelPlace(editor)
  let id: string | null
  if (mode === "replace" && at.from !== at.to) {
    const content = await answerContent(editor.state, markdown, isInlineRange(editor.state, at.from, at.to))
    const target = Array.isArray(content) ? wholeLines(editor.state, at.from, at.to) : at
    id = show(editor, null, target.from, target.to, content)
  } else {
    const place = writePlace(editor.state, at.from, at.to)
    id = show(editor, null, place.from, place.to, (await answerContent(editor.state, markdown, false)) as JSONContent[])
  }
  if (!id) return "same"
  const inserted = !(mode === "replace" && at.from !== at.to)
  const release = setReviewer(id, {
    label: reviewLabel(model),
    // The text changed under it: below it, recorded as such.
    insertBelow: (ed, pid) => {
      const tracked = proposalsOf(ed.state).active[pid]
      const ok = insertProposalBelow(ed, pid)
      if (ok && tracked) void record(docId, action, model, insertedOutcome(ed, tracked))
      return ok
    },
  })
  followProposal(editor, id, (o) => {
    if (o.changes > 0) void record(docId, action, model, { ...o, inserted })
    release()
  })
  editor.commands.focus()
  return "shown"
}
