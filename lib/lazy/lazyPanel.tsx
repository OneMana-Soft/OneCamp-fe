"use client"

import { createContext, useContext, type ReactNode } from "react"
import type React from "react"
import { ErrorState } from "@/components/ui/error-state"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { Nothing } from "@/lib/lazy/lazyPiece"
import { useSlowAfter } from "@/hooks/useSlowAfter"
import { SLOW_LINE } from "@/lib/http/slowLine"

/**
 * A panel of the shell whose code is a chunk of its own: the right panel's
 * bodies, a thread. While its code comes it draws its placeholder (nothing by
 * default) and the rest of the screen stays as it was (V-39: next/dynamic
 * with no boundary of its own held up the shell around it until its chunk
 * landed). When its code can't come, the panel says so in its own room with
 * Try again (lazyPart also tries again when the browser is back online).
 * When its code is still coming after the app's slow limit, it says that too,
 * with a Try again that waits once more, so a slow line never leaves a blank
 * panel; the panel still comes in by itself once its code lands (V-180).
 * Its host's PanelFrame draws around all three (the right panel's header,
 * with Close live), so the placeholder is only what goes under it.
 */
export function lazyPanel<P extends object>(load: () => Promise<React.ComponentType<P>>, subject: string, placeholder: React.ComponentType<P> = Nothing): React.FC<P> {
  const Placeholder = placeholder
  // lazyPart draws this only while the code comes, so its count is the wait's. The slow wait lives here, not in
  // lazyPart, which guest and public pages share: only the shell's panels say it.
  function Coming(props: P) {
    const [slow, again] = useSlowAfter(true)
    return <Framed busy={!slow}>{slow ? <ErrorState className="h-full" subject={subject} onRetry={again} detail={SLOW_LINE} /> : <Placeholder {...props} />}</Framed>
  }
  return lazyPart<P>(load, {
    placeholder: Coming,
    failed: ({ retry }) => <Framed busy={false}><ErrorState className="h-full" subject={subject} onRetry={retry} /></Framed>,
  }).Part
}

/** `busy` while the panel's shape shows. */
export type PanelFrameProps = { busy: boolean; children: ReactNode }

/** A host's frame for its lazy panels (rightPanel.tsx); with none, the state alone. */
export const PanelFrame = createContext<React.ComponentType<PanelFrameProps> | null>(null)

function Framed({ busy, children }: PanelFrameProps) {
  const Frame = useContext(PanelFrame)
  return Frame ? <Frame busy={busy}>{children}</Frame> : children
}
