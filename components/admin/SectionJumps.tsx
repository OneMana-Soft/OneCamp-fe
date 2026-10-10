"use client"

// Jumps to the sections of one long admin tab (AI & agents stacks seven).
//
// A MENU IN THE PAGE'S HEADER, NOT A ROW AT THE TOP OF THE TAB. As a row it was
// the first thing on AI & agents and on no other tab, so that tab's first title
// sat 52px lower than every other tab's (100px on a phone, where the row
// wrapped), and switching tabs moved the content. It also scrolled away with
// the content, so the jumps were gone exactly when the page was long enough to
// want them. In the header (beside the section picker on a phone) it stays in
// view and the content's frame is the same on every tab.
//
// Buttons, not links: the address holds which section is open, and a
// #fragment there is already read as a deep link (?tab=settings#audit-log).

import { useRef } from "react"
import { ListTree } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils/helpers/cn"

export interface Jump {
  id: string
  label: string
}

/**
 * Scrolls to the section and puts focus on its heading.
 *
 * Smooth only when the person hasn't asked for less motion. And focus follows
 * the jump, so the next Tab carries on from the section rather than from the
 * menu back at the top.
 */
export function jumpTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  const heading = target.querySelector<HTMLElement>("h2, h3") ?? target
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1")
  heading.focus({ preventScroll: true })
}

/**
 * "On this page": a menu of a tab's sections. `compact` is the phone's form, an
 * icon button the height of the section picker beside it.
 */
export function SectionJumpMenu({ jumps, compact = false, className }: { jumps: Jump[]; compact?: boolean; className?: string }) {
  // The jump happens once the menu has closed: Radix gives focus back to the
  // trigger as it closes, which would otherwise take it from the heading.
  const pending = useRef<string | null>(null)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon" : "sm"}
          aria-label={compact ? "On this page" : undefined}
          className={cn(compact ? "size-11 shrink-0" : "h-11 gap-1.5 md:h-8", className)}
        >
          <ListTree aria-hidden="true" />
          {!compact && "On this page"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-52"
        onCloseAutoFocus={(e) => {
          const id = pending.current
          if (!id) return
          pending.current = null
          e.preventDefault()
          jumpTo(id)
        }}
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">On this page</DropdownMenuLabel>
        {jumps.map((j) => (
          <DropdownMenuItem key={j.id} onSelect={() => (pending.current = j.id)}>
            {j.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
