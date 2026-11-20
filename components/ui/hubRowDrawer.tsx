"use client"

import * as React from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** One of a row's tools as its drawer lists it: the control itself, the name it gives itself, whether it can be pressed. */
type RowTool = { el: HTMLElement; name: string; disabled: boolean }

/** The row's tools, in their order: each control in its toolbar, named as it names itself (its label, else its words). */
function toolsIn(bar: HTMLElement | null): RowTool[] {
  if (!bar) return []
  return Array.from(bar.querySelectorAll<HTMLElement>("button, a[href]")).flatMap((el) => {
    const name = (el.getAttribute("aria-label") || el.textContent || "").trim()
    return name ? [{ el, name, disabled: el.matches(":disabled") || el.getAttribute("aria-disabled") === "true" }] : []
  })
}

/** A press on a tool as a finger makes one: its pointerdown, on which a menu's trigger opens (components/ui/dropdown-menu Press), then its click. */
function press(el: HTMLElement) {
  const Pointer = typeof PointerEvent === "function" ? PointerEvent : MouseEvent
  el.dispatchEvent(new Pointer("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerType: "touch" } as PointerEventInit))
  el.click()
}

/** A tool's own glyph, drawn again in its drawer row. */
function ToolGlyph({ of }: { of: HTMLElement }) {
  const at = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const glyph = of.querySelector("svg")
    if (glyph && at.current) at.current.replaceChildren(glyph.cloneNode(true))
  }, [of])
  return <span ref={at} aria-hidden className="grid size-4 shrink-0 place-items-center text-ink-3 [&>svg]:size-4" />
}

/**
 * Where nothing can hover, a row's tools are one drawer away (V-704; shown
 * there only, app/hub.css): Actions opens the app's menu, a sheet on a phone,
 * listing the row's own tools in their own words, for every HubRow. A row of
 * it presses the tool itself, which stays in the row unseen, so each tool
 * works as it does under a mouse: its menu, its panel, its link. HubRow draws
 * it from its first tap on Actions (components/ui/hubRow), open.
 */
export function HubRowDrawer({ bar, open, onOpenChange, byKey, children }: {
  bar: React.RefObject<HTMLSpanElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Drawn open by a key: its first row takes the focus, as a menu's trigger gives it. */
  byKey: boolean
  /** The Actions button. */
  children: React.ReactElement
}) {
  const [tools, setTools] = React.useState<RowTool[]>(() => (open ? toolsIn(bar.current) : []))
  const more = React.useRef<HTMLButtonElement>(null)
  // The tool chosen: pressed once the drawer has closed and given Actions the
  // focus back, so a panel or menu the tool opens keeps the focus.
  const chosen = React.useRef<HTMLElement | null>(null)
  // It mounts on the opening key, so Radix never heard that key and focuses no
  // row (components/ui/menuOnDemand does the same, for the same reason).
  const keyed = React.useRef(byKey)
  // A tool that opens its own surface gets the focus back from it on close, as a trigger does; hidden here
  // (app/hub.css), it can't hold it: a focus lost then goes to Actions (CR-333 N2).
  const watch = React.useRef<MutationObserver>(undefined)
  React.useEffect(() => () => watch.current?.disconnect(), [])
  const catchFocus = (tool: HTMLElement) => {
    watch.current?.disconnect()
    watch.current = new MutationObserver(() => {
      if (tool.getAttribute("aria-expanded") === "true") return
      watch.current?.disconnect()
      setTimeout(() => {
        const at = document.activeElement
        if (!at || at === document.body || at === tool) more.current?.focus({ preventScroll: true })
      })
    })
    watch.current.observe(tool, { attributeFilter: ["aria-expanded"] })
  }
  const onOpenAutoFocus = (e: Event) => {
    if (!keyed.current) return
    keyed.current = false
    e.preventDefault()
    ;(e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus()
  }
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next) setTools(toolsIn(bar.current))
        onOpenChange(next)
      }}
    >
      <DropdownMenuTrigger ref={more} asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        {...{ onOpenAutoFocus }}
        // A key in the drawer is the drawer's, never the row's or its list's
        // (a portal's events still pass through them).
        onKeyDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          const tool = chosen.current
          chosen.current = null
          if (!tool) return
          e.preventDefault()
          more.current?.focus()
          if (tool.hasAttribute("aria-expanded")) catchFocus(tool)
          press(tool)
        }}
      >
        {tools.map((t, i) => (
          <DropdownMenuItem key={i} disabled={t.disabled} onSelect={() => {
              chosen.current = t.el
            }}>
            <ToolGlyph of={t.el} />
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
