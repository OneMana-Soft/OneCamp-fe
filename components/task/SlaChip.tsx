"use client"

// A task's SLA on a list's row or a board's card (linear-24 W1): the time
// left, or Breached, in its band's tone (lib/work/sla), the whole words in
// its tip. A chunk of its own (each row's lazyPiece): only a project with SLAs on
// sends task_sla, so no other list loads it. Drawn for slaShown only.

import { AlertTriangle, Timer } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { SLA_TONES, slaBand, slaShown, slaTone, slaWords, type TaskSla } from "@/lib/work/sla"

export default function SlaChip({ sla, hidden, done = false, className }: { sla?: TaskSla; hidden?: boolean; done?: boolean; className?: string }) {
  if (!slaShown(sla, hidden)) return null
  const now = new Date()
  const band = slaBand(sla, now)
  const tone = SLA_TONES[slaTone(band, done)]
  // At risk carries its own glyph, so it reads apart from on track by more than hue.
  const Glyph = tone.alert ? AlertTriangle : Timer
  const words = slaWords(sla, now)
  return (
    <span
      data-sla={band}
      title={words.long}
      aria-label={words.long}
      role="img"
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm text-3xs font-[510] tabular-nums", tone.chip, className)}
    >
      <Glyph className="size-3" aria-hidden="true" data-glyph={tone.alert ? "alert" : "timer"} />
      {words.short}
    </span>
  )
}
