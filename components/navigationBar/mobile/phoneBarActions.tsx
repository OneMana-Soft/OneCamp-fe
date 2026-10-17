"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/** The phone top bar's trailing slot, marked in mobileTopNavigationBar.tsx. */
const PHONE_BAR_END = "data-phone-bar-end"

/**
 * A page's own controls, in the phone's top bar (design v3, mobile C2): one
 * bar holding the page's name and its tools, not the bar and then a second
 * row of the page's own under it. The OneCamp AI page drew exactly that, a
 * 52px row holding only New chat, History and More. The controls stay the
 * page's (their state, their dialogs); only where they are drawn moves. 40px
 * targets with 20px glyphs (app/phone.css). Nothing until the bar is there.
 */
export function PhoneBarActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Element | null>(null)
  useEffect(() => setSlot(document.querySelector(`[${PHONE_BAR_END}]`)), [])
  if (!slot) return null
  return createPortal(
    // 4px apart: a 40px tool's tap reaches 2px past it (44, app/phone.css F3).
    <div data-phone-bar-actions="" className="flex items-center gap-1">
      {children}
    </div>,
    slot,
  )
}
