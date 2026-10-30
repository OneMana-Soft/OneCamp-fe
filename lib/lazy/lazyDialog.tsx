"use client"

import React, { useState } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { OverlayUnavailable } from "@/lib/lazy/overlayUnavailable"

/** A dialog drawn while it's closed too, to close with its own animation. */
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
 * only might open it doesn't carry it. One drawn while closed (open,
 * onOpenChange) stays mounted once open, to close with its own animation; one
 * drawn only while open (onClose) is open whenever it's drawn. Neither
 * suspends while its code comes, so the screen behind it stays as it was
 * (V-39: next/dynamic with no boundary of its own sent the page back to its
 * loading skeleton). When its code can't come, opening it says so in a toast
 * ("Couldn't open `what`", OverlayUnavailable: every lazy overlay's failed
 * part) and closes; the next open tries again.
 */
export function lazyDialog<P extends DialogProps>(load: () => Promise<React.ComponentType<P>>, what: string): React.FC<P> {
  function Unavailable(props: P & { retry: () => void }) {
    return isOpen(props) ? <OverlayUnavailable title={`Couldn't open ${what}`} onClose={() => close(props)} /> : null
  }
  const part = lazyPart<P>(load, { placeholder: NotYet, failed: Unavailable })
  return function LazyDialog(props: P) {
    const open = isOpen(props)
    const [asked, setAsked] = useState(open)
    // Kept from the first open on (information from earlier renders).
    if (open && !asked) setAsked(true)
    // An open after a failed fetch tries again (warm is safe while rendering).
    if (open) void part.warm()
    return asked ? <part.Part {...props} /> : null
  }
}
