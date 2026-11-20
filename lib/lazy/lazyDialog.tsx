"use client"

import React from "react"
import { useLatch } from "@/hooks/useLatch"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { OverlayUnavailable, overlayCame } from "@/lib/lazy/overlayUnavailable"

/** A dialog drawn while it's closed too (mounted from its first open), to close with its own animation. */
interface OpenProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** A dialog drawn only while it's open, which closes through onClose. */
interface MountedProps {
  onClose: () => void
}

type DialogProps = OpenProps | MountedProps

const isOpen = (p: DialogProps) => !("open" in p) || p.open
const close = (p: DialogProps) => ("onClose" in p ? p.onClose() : p.onOpenChange(false))

const NotYet = () => null

/**
 * A dialog fetched the first time it opens (a lazy part), so a screen that
 * only might open it doesn't carry it. It doesn't suspend while its code comes
 * (V-39: bare next/dynamic sent the page back to its loading skeleton). When
 * its code can't come, opening it says so in a toast (OverlayUnavailable) and
 * closes; the next open tries again, and the code coming, however asked, takes
 * that toast down. warm() fetches it sooner (an opener's pointer or focus, an
 * idle page); it resolves, never rejects.
 */
export function lazyDialog<P extends DialogProps>(load: () => Promise<React.ComponentType<P>>, what: string): React.FC<P> & { warm(): Promise<boolean> } {
  const title = `Couldn't open ${what}`
  function Unavailable(props: P & { retry: () => void }) {
    return isOpen(props) ? <OverlayUnavailable title={title} onClose={() => close(props)} /> : null
  }
  const part = lazyPart<P>(() => load().then((c) => (overlayCame(title), c)), { placeholder: NotYet, failed: Unavailable })
  function LazyDialog(props: P) {
    const open = isOpen(props)
    const asked = useLatch(open)
    // An open after a failed fetch tries again (warm is safe while rendering).
    if (open) void part.warm()
    return asked ? <part.Part {...props} /> : null
  }
  return Object.assign(LazyDialog, { warm: part.warm })
}
