"use client"

// The SLA filter's lazy part (linear-24 W1): the Filter's SLA list and its chip's words, a chunk
// the list's toolbar loads once the project's SLA view says its reader may
// filter by it (hooks/useSlaView). It imports none of the shared core
// (app/slaLazy.test): its choices are words and a dot in each one's tone.

import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils/helpers/cn"
import { SLA_TONES, slaFilterWords } from "@/lib/work/sla"
import { SLA_CHOICES } from "@/lib/work/slaFilter"

/** The Filter's SLA list: Breached, At risk, On track, Met and No SLA, each a tick. */
export function SlaFacet({ chosen, onToggle }: { chosen: string[]; onToggle: (id: string) => void }) {
  return (
    <>
      {SLA_CHOICES.map((o) => (
        <DropdownMenuCheckboxItem key={o.key} checked={chosen.includes(o.key)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onToggle(o.key)} className="h-[30px] gap-2 text-sm">
          <span aria-hidden="true" data-dot={o.tone} className={cn("size-2 shrink-0", SLA_TONES[o.tone].dot)} />
          <span className="truncate">{o.label}</span>
        </DropdownMenuCheckboxItem>
      ))}
    </>
  )
}

/** The filter chip's words for what's chosen. */
export function SlaWords({ chosen }: { chosen: string[] }) {
  return <>{slaFilterWords(chosen)}</>
}
