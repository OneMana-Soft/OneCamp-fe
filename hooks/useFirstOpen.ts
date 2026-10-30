import { useState } from "react"

/**
 * Whether an overlay has been opened yet: false until `open` first turns
 * true, then true for good. Drawn from then on, the overlay plays its closing
 * motion; before, nothing of it is drawn (C3: an event's card opens with no
 * closed menu or sheet in it).
 */
export function useFirstOpen(open: boolean): boolean {
  const [was, setWas] = useState(open)
  if (open && !was) setWas(true)
  return was || open
}
