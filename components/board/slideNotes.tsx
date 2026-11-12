"use client"

// Presenter notes (miro-28 2a), drawn: the editor a frame's notes are written in (the Frames panel's row, and the
// presenter's Add notes or Edit), and the slide's notes as the presenter sees them while presenting. Reads and writes
// come in from the board page (components/board/frameNotesReads), so this, in the lazy Frames panel and slides chunks,
// imports none of the shared core. A stale write says "Someone else changed these notes" and keeps the person's text;
// Use theirs and Save mine are then the only actions (one primary, Save mine in Save notes' place, so focus stays on
// it). Offline and refused saves keep the text too. On a phone a drawer's actions sit in its pinned footer (BarPicker's
// `footer`), 44 px tall.

import * as React from "react"
import type { FrameNote } from "@/lib/board/frameNotes"
import type { FrameNotesReads, NoteSave } from "@/components/board/frameNotesReads"
import { BarPicker } from "@/components/board/barPicker"
import { Button } from "@/components/ui/button"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Textarea } from "@/components/ui/textarea"
import { fieldKeyDown } from "@/lib/keys/ime"
import { ScrollText } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

type Said = { stale: FrameNote | null } | { offline: true } | { refused: string } | { saved: true } | null

/** The words under the field after a save: saved, or what went wrong (the text stays in the field). */
function SaveSaid({ said }: { said: Said }) {
  if (!said) return null
  if ("saved" in said) return <p className="text-meta text-ink-3" aria-live="polite">Saved</p>
  const box = "rounded-lg bg-warning/10 px-2.5 py-2 text-ui-sm text-ink"
  if ("stale" in said)
    return (
      <div role="alert" className={box}>
        <p className="font-medium">Someone else changed these notes</p>
        <p className="mt-0.5 text-ink-2">Your text is kept here. Theirs now reads:</p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-ink-2">{said.stale?.body || "(no notes)"}</p>
      </div>
    )
  return (
    <p role="alert" className={box}>
      {"offline" in said ? "You're offline. Your text is kept here: save it once you're back." : `Couldn't save the notes. ${said.refused}`}
    </p>
  )
}

/** A drawer's footer buttons: 44 px, sharing the row; a computer's, small and to the right. */
export const footButton = (foot: boolean) => (foot ? { size: "lg" as const, className: "h-11 flex-1" } : { size: "sm" as const })

/**
 * A frame's notes being written, from the note as it is each time `open` turns on (the picker opening, Edit): the
 * field (capped, counted near the cap) with what the save said, and the actions apart from it, so a phone's drawer
 * pins them in its footer. While a stale save shows, Use theirs and Save mine are the only actions.
 */
function useNoteDraft({ frame, reads, open, foot, onDone }: { frame: string; reads: FrameNotesReads; open: boolean; foot: boolean; onDone?: () => void }) {
  const note = reads.notes?.get(frame)
  const [text, setText] = React.useState(note?.body ?? "")
  // The version the text was written over: a save names it, and the server refuses it once someone saved since.
  const [base, setBase] = React.useState(note?.version ?? 0)
  const [said, setSaid] = React.useState<Said>(null)
  const [saving, setSaving] = React.useState(false)
  const ready = open && !!reads.notes
  const [seeded, setSeeded] = React.useState(ready)
  if (ready !== seeded) {
    setSeeded(ready)
    if (ready) {
      setText(note?.body ?? "")
      setBase(note?.version ?? 0)
      setSaid(null)
    }
  }
  const changed = text !== (note?.body ?? "") || base !== (note?.version ?? 0)
  const stale = said && "stale" in said ? { body: said.stale?.body ?? "", version: said.stale?.version ?? 0 } : null
  const save = async () => {
    setSaving(true)
    const r: NoteSave = await reads.save(frame, text, stale ? stale.version : base)
    setSaving(false)
    if ("saved" in r) {
      setBase(r.saved?.version ?? 0)
      setSaid({ saved: true })
      onDone?.()
    } else setSaid(r)
  }
  const theirs = () => {
    setText(stale?.body ?? "")
    setBase(stale?.version ?? 0)
    setSaid(null)
  }
  const field = (
    <Textarea
      aria-label="Presenter notes"
      autoFocus
      value={text}
      maxLength={reads.max}
      placeholder="What to say on this slide"
      onChange={(e) => {
        setText(e.target.value)
        if (said && "saved" in said) setSaid(null)
      }}
      onKeyDown={fieldKeyDown((e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (changed || stale) && !saving) {
          e.preventDefault()
          void save()
        }
      })}
      className="max-h-60 min-h-24 text-ui"
    />
  )
  const meta = (
    <p className="min-w-0 flex-1 text-meta text-ink-3">
      {text.length > reads.max * 0.8 ? `${text.length.toLocaleString("en")} of ${reads.max.toLocaleString("en")}` : "Followers never see these."}
    </p>
  )
  const b = footButton(foot)
  const actions = (
    <div className="flex items-center justify-end gap-2">
      {stale ? (
        <Button key="theirs" {...b} variant="secondary" onClick={theirs}>
          Use theirs
        </Button>
      ) : (
        onDone && (
          <Button key="cancel" {...b} variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )
      )}
      {/* One button in one place: the stale save's Save mine takes Save notes' place, and the focus on it stays. */}
      <Button key="save" {...b} disabled={!stale && !changed} busy={saving} onClick={() => void save()}>
        {stale ? "Save mine" : "Save notes"}
      </Button>
    </div>
  )
  return { field, meta, said: <SaveSaid said={said} />, actions }
}

/** Writing done (Cancel, a save), the focus that went with the editor goes back to what opened it: Edit or Add notes. */
function useFocusBack(writing: boolean) {
  const back = React.useRef<HTMLButtonElement>(null)
  const wrote = React.useRef(false)
  React.useEffect(() => {
    if (writing) wrote.current = true
    else if (wrote.current) {
      wrote.current = false
      if (!document.activeElement || document.activeElement === document.body) back.current?.focus()
    }
  }, [writing])
  return back
}

/** A draft in one column: on a computer its actions beside the count; in a drawer they are the drawer's footer's. */
function DraftBody({ draft, foot }: { draft: ReturnType<typeof useNoteDraft>; foot: boolean }) {
  return (
    <div className="grid gap-2">
      {draft.field}
      {foot && draft.meta}
      {draft.said}
      {!foot && (
        <div className="flex items-center gap-2">
          {draft.meta}
          {draft.actions}
        </div>
      )}
    </div>
  )
}

/** A frame's notes, written in place (the presenter's Add notes or Edit at the outline's foot on a computer). */
export function NoteEditor({ frame, reads, onDone }: { frame: string; reads: FrameNotesReads; onDone?: () => void }) {
  const draft = useNoteDraft({ frame, reads, open: true, foot: false, onDone })
  return <DraftBody draft={draft} foot={false} />
}

/** A frame row's Notes (an editor's): its editor in a popover on a computer, a drawer on a phone (actions pinned). */
export function FrameNotesButton({ frame, name, reads }: { frame: string; name: string; reads: FrameNotesReads }) {
  const [open, setOpen] = React.useState(false)
  const foot = useSheetMode()
  const draft = useNoteDraft({ frame, reads, open, foot })
  const has = !!reads.notes?.get(frame)?.body
  return (
    <BarPicker
      side="bottom"
      title={`Notes for ${name}`}
      open={open}
      onOpenChange={setOpen}
      footer={foot && reads.notes ? draft.actions : undefined}
      trigger={
        <button
          type="button"
          aria-label={has ? `Notes for ${name}` : `Add notes for ${name}`}
          title="Presenter notes: only people who can edit the board see them"
          data-has-notes={has ? "" : undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md outline-none transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand max-sm:size-11 [&_svg]:size-4",
            // A frame with notes shows a tinted chip, one without a bare icon (on hover, focus or touch): two kinds, not two colours.
            has ? "bg-brand-muted text-brand-text" : "text-ink-3 opacity-0 group-hover/frame:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          <ScrollText aria-hidden />
        </button>
      }
    >
      <div className="w-[288px] max-w-full max-sm:w-full">{reads.notes ? <DraftBody draft={draft} foot={foot} /> : reads.waiting}</div>
    </BarPicker>
  )
}

/** The slide's notes as the presenter sees them at the outline's foot on a computer: read, or written in place. */
export function SlideNotes({ frame, reads, className }: { frame: string; reads: FrameNotesReads; className?: string }) {
  const [writing, setWriting] = React.useState(false)
  const back = useFocusBack(writing)
  const body = reads.notes?.get(frame)?.body ?? ""
  const label = "flex items-center gap-1.5 text-meta font-medium text-ink-3 [&_svg]:size-3.5"
  return (
    <section aria-label="Notes for this slide" data-slide-notes="" className={cn("grid gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <p className={cn(label, "flex-1")}>
          <ScrollText aria-hidden />
          Notes
          <span className="font-normal">· Followers don&apos;t see these</span>
        </p>
        {reads.notes && body && !writing && (
          <Button ref={back} size="xs" variant="ghost" onClick={() => setWriting(true)}>
            Edit
          </Button>
        )}
      </div>
      {!reads.notes ? (
        reads.waiting
      ) : writing ? (
        <NoteEditor frame={frame} reads={reads} onDone={() => setWriting(false)} />
      ) : body ? (
        <NotesText body={body} />
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-sunken px-2.5 py-2">
          <p className="min-w-0 flex-1 text-ui-sm text-ink-3">No notes for this slide</p>
          <Button ref={back} size="xs" variant="secondary" onClick={() => setWriting(true)}>
            Add notes
          </Button>
        </div>
      )}
    </section>
  )
}

/** The slide's notes as read, in their own scroll. */
function NotesText({ body }: { body: string }) {
  return <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-ui text-ink">{body}</p>
}

/**
 * The slide's notes on a phone: a drawer named for the slide, opened from Notes in the Presenting pill (so the slide
 * bar keeps the slide's name), with its Edit or Add notes, then Cancel and Save notes, in the drawer's pinned footer.
 */
export function SlideNotesDrawer({ frame, name, reads, open, onOpenChange }: { frame: string; name: string; reads: FrameNotesReads; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [writing, setWriting] = React.useState(false)
  const draft = useNoteDraft({ frame, reads, open: open && writing, foot: true, onDone: () => setWriting(false) })
  const back = useFocusBack(writing)
  const body = reads.notes?.get(frame)?.body ?? ""
  const footer = !reads.notes ? undefined : writing ? (
    draft.actions
  ) : (
    <div className="flex">
      <Button ref={back} {...footButton(true)} variant={body ? "secondary" : "default"} onClick={() => setWriting(true)}>
        {body ? "Edit" : "Add notes"}
      </Button>
    </div>
  )
  return (
    <BarPicker
      title={`Notes for ${name}`}
      open={open}
      onOpenChange={(o) => {
        if (!o) setWriting(false)
        onOpenChange(o)
      }}
      footer={footer}
    >
      <section aria-label="Notes for this slide" data-slide-notes="" className="grid gap-1.5">
        <p className="text-meta text-ink-3">Followers don&apos;t see these</p>
        {!reads.notes ? (
          reads.waiting
        ) : writing ? (
          <DraftBody draft={draft} foot />
        ) : body ? (
          <NotesText body={body} />
        ) : (
          <p className="rounded-lg bg-sunken px-2.5 py-2 text-ui-sm text-ink-3">No notes for this slide</p>
        )}
      </section>
    </BarPicker>
  )
}
