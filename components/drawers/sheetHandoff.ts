"use client"

import { useState } from "react"

/**
 * A phone sheet that hands over to a layer it renders itself (a dialog, or a
 * sheet of its own: the invite dialog, the pause sheet).
 *
 * The UI manager unmounts a sheet when it closes (UnifiedUIManager), and the
 * layers the sheet renders go with it: a row that opened one and closed the
 * sheet in the same breath showed nothing, so on a phone "Invite people" and
 * "Pause notifications…" did nothing at all. Handing over, the sheet hides
 * while the layer shows, stays mounted, and closes once the layer is done.
 *
 *   const sheet = useSheetHandoff<"invite">(() => setOpenState(false))
 *   <Drawer open={sheet.sheetOpen(drawerOpenState)} onOpenChange={sheet.onSheetOpenChange}>
 *   …onClick={() => sheet.handTo("invite")}
 *   <MemberInviteDialog open={sheet.handoff === "invite"} onOpenChange={sheet.handBack} />
 */
export function useSheetHandoff<Layer extends string>(close: () => void) {
  const [handoff, setHandoff] = useState<Layer | null>(null)
  return {
    /** The layer showing, if any. */
    handoff,
    /** Shows a layer; the sheet hides behind it. */
    handTo: (layer: Layer) => setHandoff(layer),
    /** The layer's onOpenChange: once it is done, the sheet closes too. */
    handBack: (open: boolean) => {
      if (open) return
      setHandoff(null)
      close()
    },
    /** Whether the sheet shows: open, and not handed over. */
    sheetOpen: (open: boolean) => open && !handoff,
    /** The sheet's own onOpenChange: it closes unless it is handing over. */
    onSheetOpenChange: (open: boolean) => {
      if (!open && !handoff) close()
    },
  }
}
