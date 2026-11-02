/**
 * Presenting on a board (miro-21 3): a presenting screen fills its awareness's `presenting` with the view it shows,
 * and whether it holds everyone there; every other screen follows it, a share link's guest's too
 * (components/board/usePresenterFollow). Only an editor's counts: the relay stamps who may edit (presence/stamp), and
 * a tab honours presenting and holds only from them. Pure.
 */
import { stampedEditor } from "@/components/docEditor/presence/stamp"
import type { BoardView } from "@/lib/board/viewport"

/** The awareness field a presenting screen fills with the view it shows (null when it stops). */
export const PRESENTING_FIELD = "presenting"

/** Another screen presenting: who, and the view it shows. */
export interface Presenter {
  clientId: number
  userId: string
  name: string
  view: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">
  /** The presenter holds everyone on their view until they let them move (miro-21 3). */
  hold?: boolean
}

/** A board's awareness, as far as the reader needs it. */
export interface PresenceStates {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
}

/**
 * Every other screen presenting (its awareness has a view); this screen's own never counts, nor does one from someone
 * the relay doesn't stamp an editor: only an editor presents or holds everyone.
 */
export function presentersIn(awareness: PresenceStates | null | undefined): Presenter[] {
  const out: Presenter[] = []
  awareness?.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID || !stampedEditor(state)) return
    const p = state[PRESENTING_FIELD] as Omit<Presenter, "clientId"> | null | undefined
    if (p?.view) out.push({ ...p, clientId })
  })
  return out
}
