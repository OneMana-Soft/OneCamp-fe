import { acceptDoor } from "@/lib/calls/acceptJoin"

// What Accept on a ring does at its call's door (lib/calls/acceptJoin), in the
// ring host's and the join's chunks only. The host names the door; the door's
// join takes it once and says when it ends, in the call or refused; the ring's
// card says Joining… until then and goes. The door's prejoin alone says how the
// join went, under its own Join now (DESIGN-BUILD-118 F1: both said it).

let took = false
let ended: (() => void) | undefined

function name(at: string, then?: () => void) {
  acceptDoor.at = at
  took = false
  ended = then
  acceptDoor.seen.forEach((f) => f())
}

/** Accept opened the call at this door; `then` hears its join end (joinEnded). An Accept before it is over. */
export function accepted(at: string, then?: () => void): void {
  const before = ended
  name(at, then)
  before?.()
}

/** Takes Accept's join at this door, once. */
export function takeAccepted(at: string): boolean {
  if (acceptDoor.at !== at || took) return false
  return (took = true)
}

/** The join this door took is over: in the call, refused (its prejoin says why), or the door closed. */
export function joinEnded(at: string): void {
  if (acceptDoor.at !== at || !took) return
  const then = ended
  name("")
  then?.()
}

/** Takes back an Accept no door took, so a call opened later never joins by itself; whether there was one. */
export function withdrawAccepted(at: string): boolean {
  if (acceptDoor.at !== at || took) return false
  name("")
  return true
}
