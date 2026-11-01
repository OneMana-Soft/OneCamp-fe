"use client"

// The board's side panel (Find and replace, Frames, Filter by tag, Add from OneCamp): a sheet on a phone, a panel
// floating at the board's right on a computer. Its name heads it, and what it does sits in a footer pinned under its
// one scroller, so however long the list above grows, the actions stay in sight (and in a thumb's reach on a phone:
// the owner's overlay rule, 18 Oct).
// Each panel's code is a chunk of its own, so the board's tools draw its frame at once (BoardSideFrame, V-195): a tap
// that waits on that code raises the sheet with the panel's name and shape, never a blank board, and the panel then
// fills that same frame, so the sheet rises once. Loaded with the board's tools, never with the board's first paint.

import * as React from "react"
import { createPortal } from "react-dom"
import { Drawer, DrawerContent, DrawerTitle, type SheetDetent } from "@/components/ui/drawer"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PanelFrame } from "@/lib/lazy/lazyPanel"
import { X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** What a panel marks itself with (data-frames-panel, data-tag-filter): on the sheet, or on the panel. */
type Marks = { [mark: `data-${string}`]: string }

/** A side panel's name, close and height, and its marks: its own, and its frame's before its code has come. */
export type SideWords = {
  /** Its heading, and its name to a screen reader. */
  name: string
  /** The computer's close button's name ("Close frames"). A sheet closes by its grabber, its scrim or Escape. */
  closeLabel: string
  /** The sheet's height: half for a long list, medium to fit what it holds. */
  detent?: SheetDetent
} & Marks

/** The board's side panels, as one place says them: each panel's own words and its frame's (boardWorkbench). */
export const SIDE_PANELS: Record<"find" | "frames" | "tagFilter" | "addWork", (editable?: boolean) => SideWords> = {
  find: (editable) => ({ name: editable ? "Find and replace" : "Find on board", closeLabel: "Close find", detent: "half", "data-board-find": "" }),
  frames: () => ({ name: "Frames", closeLabel: "Close frames", "data-frames-panel": "" }),
  tagFilter: () => ({ name: "Filter by tag", closeLabel: "Close Filter by tag", detent: "medium", "data-tag-filter": "" }),
  addWork: () => ({ name: "Add from OneCamp", closeLabel: "Close Add from OneCamp", detent: "half", "data-add-work": "" }),
}

/** A frame's hold on the panel in it: the frame's foot, where the panel's footer goes, and how the panel says what the frame shows of it. */
type Host = { foot: HTMLElement | null; say: (footer: boolean, count: number | undefined) => void }

const InFrame = React.createContext<Host | null>(null)

type Shell = SideWords & {
  /** How many it lists, beside its name on a computer. */
  count?: number
  /** Its foot, pinned under the scroller; none, and there's no footer. */
  foot?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

/** The side panel's shell: a panel's own (BoardSidePanel) or the frame its code comes into (BoardSideFrame). */
function SideShell({ name, closeLabel, count, foot, detent = "half", onClose, children, ...marks }: Shell) {
  const sheet = useSheetMode()

  if (sheet) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()} detent={detent}>
        <DrawerContent {...marks} header={<DrawerTitle asChild><p className="text-heading text-ink">{name}</p></DrawerTitle>} footer={foot || undefined}>
          <div className={cn("px-2", foot ? "pb-2" : "pb-6")}>{children}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <aside
      aria-label={name}
      {...marks}
      data-board-chrome=""
      className="content-float pointer-events-auto absolute right-3 top-16 z-30 flex max-h-[calc(100%-9rem)] w-[300px] flex-col rounded-xl bg-pop shadow-e3"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-3.5 pr-1.5">
        <p className="flex-1 text-heading text-ink">{name}</p>
        {count !== undefined && count > 0 && <span className="text-meta tabular-nums text-ink-3">{count}</span>}
        <Button variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", !foot && "pb-3")}>{children}</div>
      {foot && (
        <div data-board-panel-footer="" className="shrink-0 border-t border-line px-3 py-2.5">
          {foot}
        </div>
      )}
    </aside>
  )
}

export function BoardSidePanel({
  count,
  footer,
  children,
  ...words
}: SideWords & {
  /** How many it lists, beside its name on a computer. */
  count?: number
  /**
   * Its actions, pinned under the scroller: told whether they're on a phone's sheet, where buttons are full-size.
   * Nothing given, or nothing returned, and there's no footer.
   */
  footer?: (sheet: boolean) => React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  const host = React.useContext(InFrame)
  const sheet = useSheetMode()
  const foot = footer?.(sheet)
  if (host) return <FillsFrame host={host} foot={foot} count={count}>{children}</FillsFrame>
  return (
    <SideShell {...words} count={count} foot={foot}>
      {children}
    </SideShell>
  )
}

/**
 * A panel in its frame: what it holds, in place in the frame's scroller; its footer, in the frame's foot, still the
 * panel's own (a portal), so a field there keeps its words and its focus as the panel draws again.
 */
function FillsFrame({ host, foot, count, children }: { host: Host; foot: React.ReactNode; count?: number; children: React.ReactNode }) {
  const { say } = host
  const footer = !!foot
  React.useLayoutEffect(() => say(footer, count), [say, footer, count])
  return (
    <>
      {children}
      {foot && host.foot ? createPortal(foot, host.foot) : null}
    </>
  )
}

/**
 * The frame of a side panel whose code is a chunk of its own (V-195), drawn at once from the panel's words with its
 * close live: a tap that waits on the panel's code raises the sheet (or the panel) and says what it is. What it holds
 * while that code comes is lazyPanel's, drawn alone in it: the panel's shape, at 10 s the slow line with Try again, or
 * a failure. The panel, once in, fills this same frame (BoardSidePanel in it): its body in place, its footer in the
 * frame's foot, its count beside the name. The frame never goes away on the way, so a phone's sheet rises once.
 */
export function BoardSideFrame({ onClose, children, ...words }: SideWords & { onClose: () => void; children: React.ReactNode }) {
  const [said, setSaid] = React.useState<{ footer: boolean; count?: number }>({ footer: false })
  const [foot, setFoot] = React.useState<HTMLElement | null>(null)
  const say = React.useCallback(
    (footer: boolean, count: number | undefined) => setSaid((now) => (now.footer === footer && now.count === count ? now : { footer, count })),
    [],
  )
  const host = React.useMemo(() => ({ foot, say }), [foot, say])
  return (
    <SideShell {...words} count={said.count} onClose={onClose} foot={said.footer ? <div ref={setFoot} className="contents" /> : undefined}>
      <PanelFrame.Provider value={null}>
        <InFrame.Provider value={host}>{children}</InFrame.Provider>
      </PanelFrame.Provider>
    </SideShell>
  )
}

/** A side panel's shape while its code comes, in its frame: a field and three rows, where the panel will draw them. */
export function SidePanelShape() {
  return (
    <div role="status" aria-label="Loading" data-board-panel-shape="" className="grid gap-3 px-1 pt-1">
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="grid gap-2.5" aria-hidden="true">
        {["w-5/6", "w-2/3", "w-3/4"].map((w) => (
          <Skeleton key={w} className={cn("h-4", w)} />
        ))}
      </div>
    </div>
  )
}
