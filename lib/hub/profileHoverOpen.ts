/**
 * The profile card's open and close for a pointer resting on a person, as
 * plain functions, so a dense list can load them on the first rest instead of
 * with its first screen (hooks/useLazyProfileHover).
 */
import { hoverEnter, hoverLeave } from "@/lib/hub/hoverIntent"
import { setLastAnchor } from "@/lib/hub/lastAnchor"
import { closeUI, openUI } from "@/store/slice/uiSlice"

type Dispatch = (action: unknown) => unknown

export function restOnPerson(el: HTMLElement, userUUID: string, dispatch: Dispatch): void {
  hoverEnter(
    el,
    (anchor) => {
      setLastAnchor(anchor)
      dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
    },
    () => dispatch(closeUI("otherUserProfile")),
  )
}

export function leavePerson(): void {
  hoverLeave()
}
