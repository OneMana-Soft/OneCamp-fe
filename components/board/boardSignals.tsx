"use client"

/**
 * A board's signals (miro-24), for Here now (components/board/boardHereNow) to offer through its control: reactions
 * that rise from under their sender's face, raised hands, and an editor's word to lower one. They ride on the
 * collaboration's awareness by lib/board/signals' rules: each new one is read once, and what was there as the board
 * opened was said before this person came, so none of it shows. Anyone on the board reacts and raises a hand, viewers
 * too; editors hear of each new hand, with Lower, and only their word lowers one (the relay's stamp, presence/stamp).
 * Who has a hand up is presence's (presence/people), so the faces and Here now's queue show it as they show who is
 * here. A reaction is the shared queue and rising mark a call's are (components/reactions/rising).
 */

import * as React from "react"
import { HAND_FIELD, LOWER_FIELD, REACT_FIELD, handsRaised, lowersFor, nextLowers, nextReactions, reactionsIn } from "@/lib/board/signals"
import { Rising, useReactionQueue, type RisePoint } from "@/components/reactions/rising"
import type { Reaction } from "@/lib/reactions/set"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"

/** A board's awareness, as its signals read and say them. */
export interface Live {
  clientID: number
  getStates(): Map<number, unknown>
  getLocalState(): Record<string, unknown> | null
  setLocalStateField(field: string, value: unknown): void
  on(event: "change", cb: () => void): void
  off(event: "change", cb: () => void): void
}

/** The board's React button (components/board/boardReact): mine rise from it, and anyone's with no face drawn here. */
const REACT_BUTTON = "[data-board-react]"
/** Under a mark at the top, a reaction starts this far down, so its rise ends just under the mark. */
const RISE_ROOM = 96
/** A reaction's middle keeps this far from the window's sides, so its name stays whole. */
const SIDE = 80

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Where a reaction rises from, on this screen: under its sender's face, or the "+3" that hides them (each carries its
 * tabs, components/docEditor/ActiveUsersBar), else from the React button (mine, and a phone's, which draws no faces).
 * Under a mark in the window's top half it starts lower and rises to it; over one lower down it rises from it.
 */
export function risePoint(client: number | null): RisePoint {
  const at = (client !== null && document.querySelector(`[data-presence-client~="${client}"]`)) || document.querySelector(REACT_BUTTON)
  const r = at?.getBoundingClientRect()
  if (!r || (!r.width && !r.height)) return { x: SIDE, y: window.innerHeight - 160 }
  const x = Math.min(Math.max(r.left + r.width / 2, SIDE), window.innerWidth - SIDE)
  return { x, y: r.top + r.height / 2 < window.innerHeight / 2 ? r.bottom + RISE_ROOM : r.top - 40 }
}

/** The ids of the reactions and raised hands on a board as it opened, by field (components/board/boardSignalsLater). */
export type SignalsOpened = Readonly<Record<string, ReadonlySet<string>>>

/**
 * The board's signals on `awareness`: what Here now's control offers, and the layer the reactions rise in. It starts
 * from `opened`, what was there as the board opened (at its first sync), so the reactions and hands sent since, before
 * it was drawn, show at once.
 */
export function useBoardSignals(awareness: Live | null | undefined, editable: boolean, opened: SignalsOpened) {
  const { shown, add } = useReactionQueue()
  const { toast } = useToast()
  const [up, setUp] = React.useState(false)

  const lower = React.useCallback(
    (client: number) => awareness?.setLocalStateField(LOWER_FIELD, nextLowers(awareness.getLocalState()?.[LOWER_FIELD], client, newId())),
    [awareness],
  )
  const setHand = React.useCallback(
    (next: boolean) => {
      if (!awareness) return
      awareness.setLocalStateField(HAND_FIELD, next ? { id: newId(), raisedAt: Date.now() } : null)
      setUp(next)
    },
    [awareness],
  )
  const react = React.useCallback(
    (emoji: Reaction) => {
      // One person's reactions closer together than the queue allows count once, here and on every screen.
      if (!awareness || !add(emoji, "self", "You", true, risePoint(null))) return
      awareness.setLocalStateField(REACT_FIELD, nextReactions(awareness.getLocalState()?.[REACT_FIELD], emoji, newId()))
    },
    [awareness, add],
  )

  const heard = React.useRef({ editable, lower })
  heard.current = { editable, lower }
  React.useEffect(() => {
    if (!awareness) return
    const self = awareness.clientID
    const seen = { reactions: new Set(opened[REACT_FIELD]), hands: new Set(opened[HAND_FIELD]), lowers: new Set<string>() }
    // A lower is only ever for a hand this tab raised here, so one already there is never for this person.
    lowersFor(awareness.getStates(), self, seen.lowers)
    const onChange = () => {
      const now = awareness.getStates()
      for (const r of reactionsIn(now, self, seen.reactions)) add(r.value, `tab:${r.client}`, r.name || "Someone", false, risePoint(r.client))
      for (const h of handsRaised(now, self, seen.hands)) {
        if (!heard.current.editable) continue
        const name = h.name || "Someone"
        toast({
          title: `${name} raised a hand`,
          action: (
            <ToastAction altText={`Lower ${name}'s hand`} onClick={() => heard.current.lower(h.client)}>
              Lower
            </ToastAction>
          ),
        })
      }
      const lowered = lowersFor(now, self, seen.lowers)
      if (lowered.length > 0 && awareness.getLocalState()?.[HAND_FIELD]) {
        awareness.setLocalStateField(HAND_FIELD, null)
        setUp(false)
        toast({ title: `${lowered[0].name || "Someone"} lowered your hand` })
      }
    }
    onChange()
    awareness.on("change", onChange)
    return () => awareness.off("change", onChange)
  }, [awareness, add, toast, opened])

  const hand = React.useMemo(() => ({ up, set: setHand }), [up, setHand])
  const layer = (
    <ol role="log" aria-live="polite" aria-label="Reactions" data-board-reactions="" className="pointer-events-none fixed inset-0 z-40 m-0 list-none p-0">
      {shown.map((r) => (
        <Rising key={r.id} r={r} />
      ))}
    </ol>
  )
  return { react, hand, lower: editable ? lower : undefined, layer }
}
