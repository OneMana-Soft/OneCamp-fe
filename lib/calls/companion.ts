// Another device of someone in a call (meet-04): a companion joins for the
// chat, the hands and the reactions, or to present a screen, with no
// microphone, camera or sound. The server draws its LiveKit identity,
// "<their graph uid>~c~<12 lowercase hex>" (backend livekitInit companion.go),
// and its grant lets it publish only a screen: the web only reads it, to keep
// one row and one face for each person. Pure.

/** How another device joins: a companion, or presenting without joining (its screen is all it sends). */
export type CompanionMode = "companion" | "present"

/** The green room's or the moved screen's ask for another device: present-only carries the screen picked in the press. */
export interface CompanionChoice {
  mode: CompanionMode
  screen?: MediaStream
}

const COMPANION = /^(0x[0-9a-fA-F]{1,16})~c~[0-9a-f]{12}$/

/** The person a companion's identity belongs to, or undefined for anyone else. */
export function companionOf(identity: string): string | undefined {
  return COMPANION.exec(identity)?.[1]
}

export const isCompanion = (identity: string | undefined): boolean => !!identity && companionOf(identity) !== undefined

/** Whose device an identity is: a companion's person, anyone else themselves. */
export const personOf = (identity: string): string => companionOf(identity) ?? identity

/**
 * One row for each person (the people fold): a companion is never a row of
 * its own. It goes on its person's row when they are here (merge says how),
 * and stands for them, once, while only it is: their other device left, and
 * the server keeps them in the call by the companion alone.
 */
export function foldCompanions<P extends { identity: string }>(parts: readonly P[], merge: (row: P, companion: P) => P = (row) => row): P[] {
  const rows = new Map<string, P>()
  for (const p of parts) if (!isCompanion(p.identity)) rows.set(p.identity, p)
  for (const p of parts) {
    const person = companionOf(p.identity)
    if (person === undefined) continue
    const row = rows.get(person)
    rows.set(person, row ? merge(row, p) : p)
  }
  return [...rows.values()]
}

/** The stage's tiles without a companion's face: it has no camera, and its screen is its person's. */
export function stageTracksOf<T extends { participant: { identity: string }; source: string }>(tracks: readonly T[]): T[] {
  return tracks.filter((t) => t.source !== "camera" || !isCompanion(t.participant.identity))
}
