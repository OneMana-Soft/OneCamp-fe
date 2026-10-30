"use client"

import { LoadFailedRow } from "@/components/ui/load-failed-row"

/**
 * A piece of a screen whose code couldn't come as it was first used: the
 * network is gone, though the device may still say it's online (V-64b).
 * lazyPiece's failed state, for a piece with room to say so: one calm row in
 * the piece's own place (LoadFailedRow), what didn't load, what to do, and
 * Try again: the words a lazy overlay says too (OverlayUnavailable), and no
 * promise about what was typed, which lives only in this page until it's sent
 * (V-64c). The piece asks again by itself when the browser is back online and
 * when it's next used (lib/lazy/lazyPiece); the screen around it, an editor and
 * what it holds, carries on.
 */
export function PieceUnavailable({ what, retry }: { what: string; retry: () => void }) {
  return (
    <LoadFailedRow shown onRetry={retry}>
      Couldn&apos;t load {what}. Check your connection, then try again.
    </LoadFailedRow>
  )
}
