// A view's places (tables T5c), for the grid, the phone's list and a row's
// record: the rows given are the view's rows read in its order from place
// `from` (0, unless the view jumped), then its last `tail`, the rows added
// here, kept at its end. A place outside them is a row on its way from the
// server. Without windows the rows given are every place (count = rows, tail = 0, from = 0).

/** The index among the rows given of the row at `place`, or -1 for a row not read yet. Pure. */
export function rowAtPlace(place: number, given: number, count: number, tail: number, from = 0): number {
  const read = given - tail
  const tailFrom = count - tail
  if (place >= from && place < from + read) return place - from
  return place >= tailFrom && place < count ? read + (place - tailFrom) : -1
}

/** The place in the view of the row given at `index`. Pure. */
export function placeOfRow(index: number, given: number, count: number, tail: number, from = 0): number {
  const read = given - tail
  return index < read ? from + index : count - tail + (index - read)
}

/** The rows given: how many, the view's count, the `tail` added here, and the first read's place. */
export interface Places {
  given: number
  count: number
  tail: number
  from: number
}

/**
 * Where the row given at `index` is, by its place, once the rows given change
 * from `was` to `now` (-1: no row given holds it now). Pure.
 */
export function rowMoved(index: number, was: Places, now: Places): number {
  if (index < 0 || index >= was.given) return -1
  return rowAtPlace(placeOfRow(index, was.given, was.count, was.tail, was.from), now.given, now.count, now.tail, now.from)
}
