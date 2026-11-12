/**
 * Presenting on a board (miro-21 3): a presenting screen fills its awareness's `presenting` with the view it shows,
 * whether it holds everyone there, and the frame it shows as a slide (miro-28); every other screen follows it, a share
 * link's guest's too
 * (components/board/usePresenterFollow). Only an editor's counts: the relay stamps who may edit (presence/stamp), and
 * a tab honours presenting and holds only from them. Pure.
 */
import { stampedEditor } from "@/components/docEditor/presence/stamp"
import type { BoardView } from "@/lib/board/viewport"
import { SLIDE_ID } from "@/lib/calls/slideId"

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
  /**
   * The frame the presenter shows as a slide (miro-28: a board's frames as slides, outside a call), so each follower
   * shows that frame fitted to their own screen; none while they present the canvas.
   */
  slide?: string
}

/** Asks a board's slides for the deck's first slide as presenting starts: never a frame's id (SLIDE_ID). */
export const FIRST_SLIDE = ">"

/** What a presenting screen puts in its awareness: who, the view it shows, its hold, and its slide when on one. */
export function presentingStamp(user: { id: string; name: string }, view: Presenter["view"], hold: boolean, slide: string): Omit<Presenter, "clientId"> {
  const stamp = { userId: user.id, name: user.name, view, hold }
  return SLIDE_ID.test(slide) ? { ...stamp, slide } : stamp
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
    if (!p?.view) return
    // A tab can claim anything: a slide that's no frame's id is dropped, and the view is followed.
    const { slide, ...rest } = p
    out.push(typeof slide === "string" && SLIDE_ID.test(slide) ? { ...rest, slide, clientId } : { ...rest, clientId })
  })
  return out
}
