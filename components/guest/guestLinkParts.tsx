"use client"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronDown } from "@/lib/icons"
import type { GuestCapability } from "@/services/guestService"

// The share card's small parts (components/guest/GuestLinkSection), which a
// board link's own controls (components/guest/boardLinkControls, which the
// card imports) use too: one copy of each, in the card's code.

// The expiry options' "Does not expire": a UI-only sentinel. It never travels
// as a ttl, because 0 already means "use the server default" on the wire, and a
// link that never expires is sent as its own flag rather than as an unusual
// duration.
export const NEVER = -1

/** A role a link may give, in the words its menu says. */
export type Role = { value: GuestCapability; label: string }

/** A 28 px ghost menu: "Can view ▾". */
export function GhostMenu({ label, name, options, onSelect }: { label: string; name: string; options: { value: string; label: string }[]; onSelect: (v: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-ui-sm font-medium text-ink-2" aria-label={`${name}: ${label}`}>
          {label}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => onSelect(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
