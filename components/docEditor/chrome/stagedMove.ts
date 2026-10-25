/**
 * Blocks B1 staged to move out of a doc (WAVE_B_CONTRACTS "Dialogs"): B1's
 * block menu stages them in its components/docEditor/blockMove.ts and opens
 * the doc.moveTo dialog, which reads them as it opens (useHandoff:
 * peekBlockMove, then releaseBlockMove once it is shown).
 *
 * B6 is built beside B1, so B1's module isn't in this tree yet: until it is,
 * no blocks are ever staged and the dialog moves the page. The wiring of B1
 * with B6 replaces this file's body with one line:
 *
 *   export { peekBlockMove as peekStagedMove, releaseBlockMove as releaseStagedMove } from "@/components/docEditor/blockMove"
 */

export interface StagedMove {
  /** How many blocks: "Move 3 blocks to…". */
  count: number
  /** Adds the blocks at the end of the target, then takes them out of this doc. Throws an Error that says what to do. */
  moveTo(targetDocId: string): Promise<void>
}

export function peekStagedMove(docId: string): StagedMove | null {
  void docId
  return null
}

export function releaseStagedMove(move: StagedMove): void {
  void move
}
