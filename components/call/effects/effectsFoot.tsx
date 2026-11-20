"use client"

// A host's pinned foot for the made background's actions (AiBackground.tsx):
// phone overlays are drawers, with their actions in a pinned footer. The
// green room's sheet puts `footer` in DrawerContent's own footer slot; the
// call's panel, in the foot under its scroller. The composer holds the foot
// while it has actions (Cancel while making, Use this and the remake once
// made) and draws them into `node`; held by nothing, there is no foot.

import * as React from "react"

export type EffectsFoot = { node: HTMLElement | null; hold: (held: boolean) => void }

export function useEffectsFoot(): { foot: EffectsFoot; footer: React.ReactNode } {
  const [held, setHeld] = React.useState(false)
  const [node, setNode] = React.useState<HTMLElement | null>(null)
  const foot = React.useMemo(() => ({ node: held ? node : null, hold: setHeld }), [held, node])
  return { foot, footer: held ? <div ref={setNode} data-made-foot="" /> : null }
}
