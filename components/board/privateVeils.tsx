"use client"

// Held notes on this screen whose words aren't in this tab (miro-25): while a round runs, a note someone holds reaches
// this board with no words, locked (lib/board/privateNotes); its card says whose it is. After the round, a note whose
// author hasn't opened the board since still has no words: its card says it shows when they do (their tab reveals it).
// The author's own other tab or device takes the shared copy too (V-488): its card says the note is theirs, waiting
// where they wrote it, not a blank locked note. The tab that keeps the words (`holds`) draws none.
// Each card is the note face down: the note's whole face, its edge too, in its own fill, edge, corner and ink, so
// nothing of the words the shared copy still has or of its edge shows round it. On a dark board it takes the
// canvas's own filter, as the note under it does, read from the board (a call's stage is dark in a light app).

import * as React from "react"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { EyeOff } from "@/lib/icons"
import { useBoardView } from "@/hooks/useBoardView"
import { useSceneElements } from "@/hooks/useSceneElements"
import { useElementsChanged } from "@/hooks/useElementsChanged"
import { NOTE_COLOURS, isStickyNote, noteColourOf } from "@/lib/board/notes"
import { veiledBy } from "@/lib/board/privateNotes"
import { BOARD_DARK_FILTER, noteFace } from "@/components/board/noteTagChips"
import type { SceneElement } from "@/components/board/boardOps"

/** The veil's words for a held note: whose it is while the round runs, when it shows after; `mine` on its author's other tab or device. */
export const veilWords = (name: string, running: boolean, mine = false) =>
  mine
    ? running
      ? "Private · you, in another tab or device"
      : "Shows when your other tab or device opens the board"
    : running
      ? `Private · ${name}`
      : `Shows when ${name} opens the board`

type Note = SceneElement & { backgroundColor?: string; strokeColor?: string; strokeWidth?: number; roundness?: { type: number; value?: number } | null }

/** A faint hatch over the face, in the note's ink: the note turned over, not a blank one. */
const HATCH = "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 9px)"

/** Whether the board is dark as Excalidraw draws it, following it as it changes. */
function useBoardDark(api: Pick<ExcalidrawImperativeAPI, "getAppState" | "onChange">) {
  const [dark, setDark] = React.useState(() => api.getAppState().theme === "dark")
  React.useEffect(() => {
    setDark(api.getAppState().theme === "dark")
    return api.onChange((_elements, state) => setDark(state.theme === "dark"))
  }, [api])
  return dark
}

export function PrivateVeils({
  api,
  me,
  running,
  holds,
}: {
  api: ExcalidrawImperativeAPI
  me: string
  running: boolean
  /** Whether this tab keeps a held element's words (it was written here): its own notes get no veil. */
  holds: (id: string) => boolean
}) {
  const dark = useBoardDark(api)
  const all = useSceneElements<Note>(api)
  const held = React.useMemo(
    () =>
      all.filter((e) => {
        const by = !e.isDeleted && isStickyNote(e as never) ? veiledBy(e) : null
        return !!by && !(by.id === me && holds(e.id))
      }),
    [all, me, holds],
  )
  const ids = React.useMemo(() => held.map((n) => n.id), [held])
  useElementsChanged(api, ids, { duringMoves: true })
  const view = useBoardView(api, held.length > 0)
  if (!view || held.length === 0) return null
  return (
    <div data-private-veils="" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {held.map((n) => {
        const face = noteFace(view, n)
        if (!face.inView) return null
        const angle = typeof n.angle === "number" ? n.angle : 0
        const by = veiledBy(n)
        const words = veilWords(by?.name || "someone", running, by?.id === me)
        const c = NOTE_COLOURS[noteColourOf(n) ?? "yellow"]
        return (
          <div
            key={n.id}
            data-private-of={n.id}
            role="note"
            aria-label={words}
            className="absolute grid place-items-center overflow-hidden border-solid p-2 text-center text-meta font-medium"
            style={{
              left: face.left,
              top: face.top,
              width: face.width,
              height: face.height,
              borderRadius: face.radius,
              borderWidth: Math.max(1, (n.strokeWidth ?? 1) * view.zoom),
              borderColor: n.strokeColor || c.edge,
              backgroundColor: n.backgroundColor || c.fill,
              color: c.ink,
              filter: dark ? BOARD_DARK_FILTER : undefined,
              transform: angle ? `rotate(${angle}rad)` : undefined,
            }}
          >
            <span aria-hidden className="absolute inset-0" style={{ backgroundImage: HATCH, opacity: 0.15 }} />
            <span className="relative flex min-w-0 flex-col items-center gap-1">
              <EyeOff className="size-4 shrink-0" aria-hidden />
              <span className="line-clamp-3 break-words">{words}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
