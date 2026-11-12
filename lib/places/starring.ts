// Starring a place, for every kind of place (miro-46): a doc's row and page
// (components/docTree/docActions) and a board's More (the board's workbench)
// star through here, so Starred agrees on what a star does wherever it was
// given. A star shows in Starred at once and is put back as it was if the
// server refuses; the refusal is said once, with the server's reason, and the
// app's own toast stays quiet (ownErrors).
//
// Permission model: a person stars only what they can open (the server checks
// the place's kind), and the server drops a star from Starred when access to
// it goes. A star is the person's own: nobody else, an admin included, sees or
// changes it.

import type { Dispatch } from "@reduxjs/toolkit"

import { toast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { addPlace, removePlace } from "@/services/docGraphService"
import { starPlace, unstarPlace } from "@/store/slice/userSlice"
import type { Place } from "@/types/docGraph"

const OWN = { ownErrors: true }

/** Says that something didn't happen, and why. */
export function failed(title: string, err: unknown, fallback = "Try again in a moment.") {
  toast({ variant: "destructive", title, description: apiErrorMessage(err, fallback) })
}

/** A place as Starred shows it until the server's own list comes. */
export const starOf = (resourceKind: string, id: string, title: string, href: string, icon?: string): Place => ({
  kind: "star",
  resource_kind: resourceKind,
  resource_uuid: id,
  position: "",
  title,
  icon,
  href,
})

/** Stars a place: in Starred at once, then on the server; taken back if it refuses. Resolves whether it is starred. */
export async function star(dispatch: Dispatch, place: Place, failure: string): Promise<boolean> {
  dispatch(starPlace({ place }))
  try {
    await addPlace("star", place.resource_kind, place.resource_uuid, undefined, OWN)
    return true
  } catch (err) {
    dispatch(unstarPlace({ resource_uuid: place.resource_uuid }))
    failed(failure, err)
    return false
  }
}

/**
 * Takes a star away: gone from Starred at once, back if the server refuses
 * (was is its place there, when the caller has it). Resolves whether the star
 * is gone.
 */
export async function unstar(dispatch: Dispatch, id: string, was: Place | undefined, failure: string): Promise<boolean> {
  dispatch(unstarPlace({ resource_uuid: id }))
  try {
    await removePlace("star", id, OWN)
    return true
  } catch (err) {
    if (was) dispatch(starPlace({ place: was }))
    failed(failure, err)
    return false
  }
}
