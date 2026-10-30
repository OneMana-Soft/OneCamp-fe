// A view's places (tables T5c), for the grid, the phone's list and a row's
// record: the rows given are the view's first rows, read from its start,
// then its last `tail`, the rows added here, kept at its end. A place between
// them is a row on its way from the server. Without windows the rows given
// are every place (count = rows, tail = 0).

/** The index among the rows given of the row at `place`, or -1 for a row not read yet. Pure. */
export function rowAtPlace(place: number, given: number, count: number, tail: number): number {
  const read = given - tail
  const tailFrom = count - tail
  return place < 0 ? -1 : place < read ? place : place >= tailFrom && place < count ? read + (place - tailFrom) : -1
}

/** The place in the view of the row given at `index`. Pure. */
export function placeOfRow(index: number, given: number, count: number, tail: number): number {
  const read = given - tail
  return index < read ? index : count - tail + (index - read)
}
