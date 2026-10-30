"use client"

import * as React from "react"

import { DropdownMenu, DropdownMenuTrigger, Press } from "@/components/ui/dropdown-menu"

/** What the menu's content takes: focus on its first item when keys opened it, and back to the button after. */
export interface OnDemandContentProps {
  onOpenAutoFocus: (event: Event) => void
  onCloseAutoFocus: (event: Event) => void
  onInteractOutside: () => void
}

type Button = React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }>

/**
 * A dropdown menu in the tree only while it is open (F-1 #2: MenuProvider
 * ×120 on a board). It joins on a press, Enter, Space or ↓, anchored on the
 * button, and leaves after it closes, focus back on the button.
 */
export function MenuOnDemand({ children, menu }: { children: Button; menu: (props: OnDemandContentProps) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const button = React.useRef<HTMLButtonElement | null>(null)
  const outside = React.useRef(false)
  const viaKeys = React.useRef(false)
  const leave = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(leave.current), [])

  const set = (next: boolean) => {
    window.clearTimeout(leave.current)
    if (next) {
      outside.current = false
      setMounted(true)
    } else {
      // Its way out first.
      leave.current = window.setTimeout(() => setMounted(false), 200)
    }
    setOpen(next)
  }

  const own = children.props
  const child = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    ref: (el: HTMLButtonElement | null) => {
      button.current = el
      const r = own.ref
      if (typeof r === "function") r(el)
      else if (r) (r as React.MutableRefObject<HTMLButtonElement | null>).current = el
    },
    "aria-haspopup": "menu",
    "data-state": open ? "open" : "closed",
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      own.onKeyDown?.(e)
      if (e.defaultPrevented || !["Enter", " ", "ArrowDown"].includes(e.key)) return
      e.preventDefault()
      viaKeys.current = true
      set(true)
    },
  })
  // Opens as every menu does (Press): on the press, or on a phone on the tap's
  // click, so the sheet that rises under the finger isn't chosen by its lift.
  const trigger = (
    <Press
      aria-expanded={open}
      onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
        viaKeys.current = false
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey) return
        if (!open) e.preventDefault()
        set(!open)
      }}
    >
      {child}
    </Press>
  )

  return (
    <span className="relative inline-flex shrink-0">
      {trigger}
      {mounted && (
        <DropdownMenu open={open} onOpenChange={set}>
          <DropdownMenuTrigger asChild>
            <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute inset-0" />
          </DropdownMenuTrigger>
          {menu({
            // It mounts on the opening key, so Radix never hears that key and focuses no item.
            // An item of any kind: a reminder's choices are menuitemradio.
            onOpenAutoFocus: (event) => {
              if (!viaKeys.current) return
              event.preventDefault()
              ;(event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])')?.focus()
            },
            onInteractOutside: () => void (outside.current = true),
            onCloseAutoFocus: (event) => {
              event.preventDefault()
              if (!outside.current) button.current?.focus()
            },
          })}
        </DropdownMenu>
      )}
    </span>
  )
}
