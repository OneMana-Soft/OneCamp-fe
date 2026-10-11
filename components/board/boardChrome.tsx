"use client"

// The board's chrome (content.md B03): the board has no top bar row. The
// canvas runs the full height of the sheet, and the board's own controls
// float over it on two `pop` clusters at the top corners (tldraw's model):
//
//  - top left: back, the board's name (click to rename), its save dot, and
//    "More";
//  - top right: who is here, Templates, Ask AI, the comment toggle and Share.
//
// They enter with float-in a beat after the canvas paints, and step back to
// 60 % while someone draws (the wrapper's data-board-drawing, set by a
// pointer listener in the page, so nothing here re-renders on a stroke, a pan
// or a zoom).

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, Ellipsis } from "@/lib/icons"
import { SaveDot, type SaveState } from "@/components/docEditor/SaveDot"
import { cn } from "@/lib/utils/helpers/cn"

/** One floating cluster: 40 px, pop, e3, r12, 4 px padding. */
export function ChromeCluster({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-board-chrome=""
      className={cn(
        "content-float pointer-events-auto flex h-10 items-center gap-0.5 rounded-xl bg-pop p-1 text-ink shadow-e3 [animation-delay:120ms]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A 32 px icon button in a cluster: ink-3 at rest, ink on hover. */
export const ClusterButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }
>(function ClusterButton({ label, active, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 outline-none transition-colors",
        "hover:bg-hover hover:text-ink active:bg-press focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
        "[&_svg]:size-4",
        active && "bg-brand-muted text-brand-text hover:bg-brand-muted hover:text-brand-text",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

/** The divider between a cluster's groups. */
export function ClusterDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line-2" />
}

/**
 * The board's name, renamed in place: a button that reads like the title,
 * and an input (raised, with the focus halo) while editing. Enter or leaving
 * saves; Escape puts it back.
 */
export function BoardName({
  title,
  editable,
  onRename,
}: {
  title: string
  editable: boolean
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(title)
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])
  React.useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim() || "Untitled board"
    if (next !== title) onRename(next)
  }

  if (!editable) {
    return <span className="max-w-[240px] truncate px-1.5 text-ui font-medium">{title || "Untitled board"}</span>
  }
  if (editing) {
    return (
      <input
        ref={input}
        value={draft}
        aria-label="Board name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") {
            setDraft(title)
            setEditing(false)
          }
        }}
        className="h-7 w-[220px] rounded-lg bg-raised px-1.5 text-ui font-medium text-ink shadow-e1 outline-none focus:ring-1 focus:ring-brand/50"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename"
      aria-label={`${title || "Untitled board"}, rename`}
      className="h-7 max-w-[240px] truncate rounded-lg px-1.5 text-ui font-medium text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
    >
      {title || "Untitled board"}
    </button>
  )
}

/** The top-left cluster: back, name, save dot, More. */
export function BoardTitleCluster({
  backHref,
  title,
  editable,
  onRename,
  saveState,
  menu,
}: {
  backHref: string
  title: string
  editable: boolean
  onRename: (title: string) => void
  saveState: SaveState
  /** The "More" menu: the trigger is passed this cluster's button. */
  menu: (trigger: React.ReactElement) => React.ReactNode
}) {
  return (
    <ChromeCluster label="Board" className="pr-1">
      <Link
        href={backHref}
        aria-label="All boards"
        title="All boards"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand [&_svg]:size-4"
      >
        <ChevronLeft />
      </Link>
      <BoardName title={title} editable={editable} onRename={onRename} />
      {!editable ? (
        <span className="tag mx-1 bg-hover text-ink-2" data-view-only="">
          View only
        </span>
      ) : null}
      <SaveDot state={saveState} live className="mr-0.5" />
      {menu(
        <ClusterButton label="More">
          <Ellipsis />
        </ClusterButton>,
      )}
    </ChromeCluster>
  )
}

/** The save dot's state from the live connection. */
export function boardSaveState(status: string, synced: boolean): SaveState {
  if (status === "offline" || status === "disconnected") return "offline"
  if (!synced) return "connecting"
  return "saved"
}

/**
 * Marks the board's wrapper while a pointer is down on the canvas, so the
 * clusters fade (CSS, [data-board-drawing]). No state, no render.
 */
export function useDrawingFade(ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("canvas")) el.dataset.boardDrawing = "true"
    }
    const up = () => {
      if (el.dataset.boardDrawing) delete el.dataset.boardDrawing
    }
    el.addEventListener("pointerdown", down, true)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      el.removeEventListener("pointerdown", down, true)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  }, [ref])
}
