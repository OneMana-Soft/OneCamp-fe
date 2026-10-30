"use client"

/**
 * Writing a suggestion (docs C5): the words chosen, as they would read, in a
 * small card under them (on a phone, the shared sheet, its actions in a
 * pinned footer), with the change drawn in the doc as it is typed:
 * what it takes out struck through in red, what it adds in green. Nothing in
 * the doc changes. ⌘↵ suggests it, kept for the doc's people to accept or
 * decline change by change (its owner is told); Esc lets go of it.
 *
 * The words chosen are held through everyone's edits while it is written
 * (target.ts): if they change under it, the card says so and suggests
 * nothing, rather than suggesting a change to other words.
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { Slice } from "@tiptap/pm/model"
import { Button } from "@/components/ui/button"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"
import { useSheetMode } from "@/components/ui/overlayMode"
import { useModKey } from "@/hooks/useModKey"
import { cn } from "@/lib/utils/helpers/cn"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { proposeReplacement, type Tracked } from "@/lib/proposals/review"
import { discardProposal, focusProposal, proposalsOf, showProposal } from "@/components/minimal-tiptap/extensions/proposals"
import { submitProposal } from "@/components/proposals/persisted"
import { contentOfText } from "./sync"
import { placeOf, targetAt, type SuggestTarget } from "./target"
import type { OpenSuggestion } from "./suggestMode"

/** What the card starts with: what was typed to open it (and after, before its focus), else the words chosen. */
export function startingText(target: SuggestTarget, open: OpenSuggestion): string {
  return open.seed !== undefined ? open.seed + (open.late ?? "") : target.text
}

// Loaded when the composer first opens on a phone, as ResponsiveDialog's is.
// The phone's sheet comes with its first use. When its code can't come (no network), it says so, as every lazy overlay
// does, and the suggestion closes before anything is typed into it; the next one asks again.
function SheetUnavailable({ onClose }: { onClose: () => void }) {
  return <OverlayUnavailable title="Couldn't open Suggest an edit" onClose={onClose} />
}
const ResponsiveSheet = lazyPiece(() => import("@/components/ui/responsive-sheet"), { failed: SheetUnavailable })

/** Why nothing can be suggested, said in the card. */
const LOST = "The words you chose changed while you wrote. Close this and choose them again."

export function SuggestComposer({ editor, docId, open, onClose }: { editor: Editor; docId: string; open: OpenSuggestion; onClose(): void }) {
  const [target] = React.useState(() => targetAt(editor.state, open.from, open.to))
  const [text, setText] = React.useState(() => (target ? startingText(target, open) : ""))
  const [note, setNote] = React.useState("")
  const [noting, setNoting] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [lost, setLost] = React.useState(!target)
  const [changed, setChanged] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)
  const draft = React.useRef<string | null>(null)
  // What was typed into the doc after it opened, as it arrives before the field has the focus.
  const late = open.late ?? ""
  const lateTaken = React.useRef(late.length)
  React.useEffect(() => {
    if (late.length <= lateTaken.current) return
    const more = late.slice(lateTaken.current)
    lateTaken.current = late.length
    setText((t) => t + more)
  }, [late])
  const card = React.useRef<HTMLDivElement>(null)
  // The field, as it mounts: on a phone it comes with the sheet's chunk, after the first render.
  const [fieldEl, fieldRef] = React.useState<HTMLTextAreaElement | null>(null)
  const wordsId = React.useId()
  const mod = useModKey()
  // The phone rule (components/ui/overlayMode): a sheet, not a card under the words.
  const sheet = useSheetMode()

  const dropDraft = React.useCallback(() => {
    if (draft.current && proposalsOf(editor.state).active[draft.current]) discardProposal(editor, draft.current)
    draft.current = null
  }, [editor])

  // The change as it would be, drawn in the doc: again on every word typed
  // and every edit to the doc. Null when it changes nothing, or the words
  // chosen aren't there any more.
  const preview = React.useCallback((): Tracked | null => {
    if (editor.isDestroyed || !target) return null
    const place = placeOf(editor.state, target)
    if (!place) {
      dropDraft()
      setLost(true)
      return null
    }
    const tracked = proposeReplacement(editor.state, place.from, place.to, new Slice(contentOfText(editor.schema, text), 0, 0))
    if (!tracked) {
      dropDraft()
      setChanged(false)
      return null
    }
    const focus = proposalsOf(editor.state).focus
    const id = draft.current ?? tracked.proposal.id
    draft.current = id
    const shown: Tracked = { ...tracked, proposal: { ...tracked.proposal, id, author_kind: "person" } }
    showProposal(editor, shown, { focus: false })
    // The review bar stays on what it was on: this isn't for review yet.
    if (proposalsOf(editor.state).focus === id && focus !== id) focusProposal(editor, focus)
    setChanged(true)
    return shown
  }, [editor, target, text, dropDraft])

  React.useEffect(() => {
    preview()
  }, [preview])

  React.useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) preview()
    }
    editor.on("transaction", onTransaction)
    return () => {
      editor.off("transaction", onTransaction)
    }
  }, [editor, preview])

  // Let go of the drawn change when the card goes, however it goes.
  React.useEffect(() => dropDraft, [dropDraft])

  // Under the words chosen, inside what is visible: on a phone, the part
  // above the keyboard (the visual viewport), so the card is never under it.
  const place = React.useCallback(() => {
    if (sheet || editor.isDestroyed || !target) return setPos(null)
    try {
      const at = placeOf(editor.state, target) ?? { from: target.from, to: target.to }
      const c = editor.view.coordsAtPos(Math.min(at.to, editor.state.doc.content.size))
      const width = card.current?.offsetWidth ?? 380
      const height = card.current?.offsetHeight ?? 200
      const visible = window.visualViewport?.height ?? window.innerHeight
      const top = Math.max(16, Math.min(c.bottom + 8, visible - height - 16))
      setPos({ top, left: Math.max(16, Math.min(c.left, window.innerWidth - width - 16)) })
    } catch {
      setPos(null)
    }
  }, [editor, target, sheet])
  React.useLayoutEffect(place, [place])
  React.useEffect(() => {
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    window.visualViewport?.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
      window.visualViewport?.removeEventListener("resize", place)
    }
  }, [place])

  // Once it is placed (a phone's sheet is, as it opens) and its field is
  // there: until then the card is invisible, and a browser doesn't focus a
  // field it can't see (jsdom does, so only e2e shows it).
  const placed = sheet || pos !== null
  const focused = React.useRef(false)
  React.useEffect(() => {
    if (!placed || !fieldEl || focused.current) return
    focused.current = true
    fieldEl.focus({ preventScroll: true })
    fieldEl.setSelectionRange(fieldEl.value.length, fieldEl.value.length)
  }, [placed, fieldEl])

  const cancel = React.useCallback(() => {
    dropDraft()
    onClose()
    if (!editor.isDestroyed) editor.commands.focus()
  }, [dropDraft, onClose, editor])

  const suggest = async () => {
    if (sending || lost) return
    const tracked = preview()
    if (!tracked) {
      setError(lost ? LOST : "Change the words to suggest something.")
      return
    }
    setSending(true)
    setError(null)
    try {
      await submitProposal(editor, tracked, docId, { note: note.trim() || undefined })
      // It shows on as the kept suggestion now, under its own id.
      draft.current = null
      onClose()
      if (!editor.isDestroyed) editor.commands.focus()
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't suggest it. Try again in a moment."))
    } finally {
      setSending(false)
    }
  }

  // ⌘↵ suggests, in the card and in a phone's sheet (whose Esc is the sheet's own close).
  const onModEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.nativeEvent.isComposing) return false
    e.preventDefault()
    void suggest()
    return true
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (onModEnter(e)) return
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
  }

  const words = (
    <>
      <label htmlFor={wordsId} className="mb-1 block text-meta font-medium text-ink-2">
        {target?.text ? "Suggest these words instead" : "Suggest words to add here"}
      </label>
      <textarea
        id={wordsId}
        ref={fieldRef}
        value={text}
        disabled={lost}
        rows={Math.min(6, Math.max(2, text.split("\n").length))}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        placeholder={target?.text ? "Leave it empty to suggest taking the words out" : "What should it say here?"}
        className="w-full resize-none rounded-md border border-line bg-background px-2 py-1.5 text-body text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
      {noting ? (
        <input
          aria-label="A note for whoever reviews it"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why, if it helps (optional)"
          className="mt-1.5 h-8 w-full rounded-md border border-line bg-background px-2 text-ui text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      ) : null}
      {lost ? (
        <p role="alert" className="pt-1 text-meta text-danger-ink">
          {LOST}
        </p>
      ) : error ? (
        <p role="alert" className="pt-1 text-meta text-danger-ink">
          {error}
        </p>
      ) : null}
    </>
  )
  const addNote = !noting ? (
    <Button type="button" variant="ghost" size="xs" className="text-ink-3" onClick={() => setNoting(true)}>
      Add a note
    </Button>
  ) : null
  const actions = (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={cancel}>
        Cancel
      </Button>
      <Button type="button" size="sm" busy={sending} disabled={lost || !changed} onClick={() => void suggest()}>
        {sending ? "Suggesting…" : "Suggest"}
      </Button>
    </>
  )

  if (sheet) {
    return (
      <React.Suspense fallback={null}>
        <ResponsiveSheet title="Suggest an edit" onClose={cancel} footer={actions}>
          {/* The sheet's Esc and scrim are its onClose; ⌘↵ still suggests from a keyboard. */}
          <div data-suggest-composer="" onKeyDown={onModEnter} className="flex flex-col">
            {words}
            {addNote ? <div className="mt-2">{addNote}</div> : null}
          </div>
        </ResponsiveSheet>
      </React.Suspense>
    )
  }
  return (
    <div
      ref={card}
      role="dialog"
      aria-label="Suggest an edit"
      data-suggest-composer=""
      // Its own Esc lets go of the suggestion: the one Escape leaves the press here (lib/keys/escape).
      data-escape-own=""
      onKeyDown={onKeyDown}
      style={pos ? { top: pos.top, left: pos.left } : undefined}
      className={cn(
        "composer-card fixed z-40 w-[min(380px,calc(100vw-32px))] rounded-xl bg-raised p-2.5 shadow-e3",
        !pos && "invisible",
      )}
    >
      {words}
      <div className="mt-2 flex items-center gap-1.5">
        {addNote}
        <span className="ml-auto hidden text-meta text-ink-3 sm:inline">
          <kbd className="kbd">{mod}</kbd>
          <kbd className="kbd ml-0.5">⏎</kbd>
        </span>
        {actions}
      </div>
    </div>
  )
}
