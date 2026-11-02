"use client"

/**
 * A board's signals (components/board/boardSignals, miro-24) on demand. Their code is a lazy piece (boardSignalsPiece)
 * that loads on the first reaction or raised hand another tab sends, or on this person's first reaction, hand or
 * Lower, so a board nobody signals on never loads it. Until then this watches the awareness for a fresh one, by the
 * rule every signal is read by (lib/board/freshSignals), from what was there as the board opened: read at the first
 * sync (presence/firstSync), since Here now is drawn before it and who is already on the board comes with it. The
 * piece starts from that too, so each one sent since shows even if it came before the piece did, and this person's
 * first act runs once the piece is in.
 */
import * as React from "react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { freshSignals } from "@/lib/board/freshSignals"
import { HAND_FIELD, REACT_FIELD } from "@/components/docEditor/presence/fields"
import { useAtFirstSync } from "@/components/docEditor/presence/firstSync"
import type { Live, SignalsOpened } from "@/components/board/boardSignals"
import type { BoardSignalActions } from "@/components/board/boardSignalsPiece"

const BoardSignalsPiece = lazyPiece(() => import("@/components/board/boardSignalsPiece"))

const FIELDS = [REACT_FIELD, HAND_FIELD]
const any = () => true

/** The ids of the reactions and raised hands other tabs have on the board now, by field. Pure but for reading `states`. */
export function signalsOn(states: ReadonlyMap<number, unknown>, self: number): SignalsOpened {
  const out: Record<string, Set<string>> = {}
  for (const field of FIELDS) freshSignals(states, self, (out[field] = new Set()), field, any)
  return out
}

/** Whether another tab has sent a reaction or raised a hand since `opened`. Pure: it marks nothing seen. */
export function signalledSince(states: ReadonlyMap<number, unknown>, self: number, opened: SignalsOpened): boolean {
  return FIELDS.some((field) => freshSignals(states, self, new Set(opened[field]), field, any).length > 0)
}

const signalsThere = (awareness: Live) => signalsOn(awareness.getStates(), awareness.clientID)

/**
 * The board's signals as Here now offers them (useBoardSignals' shape), their piece drawn in `layer` once wanted and
 * the board has synced. `synced`: the collaboration's sync (useCollaborationProvider's).
 */
export function useBoardSignalsLater(awareness: Live | null | undefined, editable: boolean, synced: boolean) {
  const opened = useAtFirstSync(awareness, synced, signalsThere)
  const [wanted, setWanted] = React.useState(false)
  const [actions, setActions] = React.useState<BoardSignalActions | null>(null)
  // This person's act from before the piece was in (only the last one: a second press replaces a first).
  const first = React.useRef<((a: BoardSignalActions) => void) | null>(null)

  React.useEffect(() => {
    if (!awareness || !opened || wanted) return
    const peek = () => {
      if (signalledSince(awareness.getStates(), awareness.clientID, opened)) setWanted(true)
    }
    peek()
    awareness.on("change", peek)
    return () => awareness.off("change", peek)
  }, [awareness, opened, wanted])

  const later = React.useCallback((act: (a: BoardSignalActions) => void) => {
    first.current = act
    setWanted(true)
  }, [])
  const onActions = React.useCallback((a: BoardSignalActions) => {
    setActions(a)
    const act = first.current
    first.current = null
    act?.(a)
  }, [])
  const ahead = React.useMemo<BoardSignalActions>(
    () => ({
      react: (emoji) => later((a) => a.react(emoji)),
      hand: { up: false, set: (up) => later((a) => a.hand.set(up)) },
      lower: editable ? (client) => later((a) => a.lower?.(client)) : undefined,
    }),
    [later, editable],
  )

  const { react, hand, lower } = actions ?? ahead
  const layer =
    wanted && awareness && opened ? (
      <React.Suspense fallback={null}>
        <BoardSignalsPiece awareness={awareness} editable={editable} opened={opened} onActions={onActions} />
      </React.Suspense>
    ) : null
  return { react, hand, lower, layer }
}
