import type { ComponentType } from "react"
import { Spark } from "@/components/ui/graphics/motifs"
import { Globe, Mail } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

// Invited (calls HU13) has no hue of its own.
const INK = { Guest: "bg-camp-sun-tint text-camp-sun-ink", Agent: "bg-agent-muted text-agent-ink", Invited: "bg-white/[0.12] text-[#D4D6DB]" } as const
type Kind = keyof typeof INK

/** An agent's glyph is the house's spark, the one its avatar draws, so an agent reads as one by shape at every size. */
function AgentGlyph({ className }: { className?: string }) {
  return <Spark size={10} className={className} />
}

// Each kind's own glyph, which its mark draws on a narrow tile (V-211; DESIGN-BUILD-76, 1 Nov): the shape says who
// someone is, and the ink only supports it.
const GLYPH: Record<Kind, ComponentType<{ className?: string; strokeWidth?: number }>> = { Guest: Globe, Agent: AgentGlyph, Invited: Mail }

/**
 * Who someone is in a call, one shape in its own ink: in the call's chat, and on a tile's name plate. As a plate's
 * `mark` it is drawn for the eye only, since the plate says it in words. In a tile under 128 px wide it turns into a
 * 14 px square of its glyph, so the name keeps its room, and its title names it on a hover.
 */
export function PersonTag({ kind, mark = false }: { kind: Kind; mark?: boolean }) {
  if (!mark) return <span className={cn("inline-flex h-4 items-center rounded-[5px] px-1.5 text-micro", INK[kind])}>{kind}</span>
  const Glyph = GLYPH[kind]
  return (
    <span
      aria-hidden="true"
      title={kind}
      data-person-tag={kind}
      className={cn(
        "inline-flex h-4 shrink-0 items-center justify-center rounded-[5px] px-1.5 text-micro",
        "@max-[128px]:pointer-events-auto @max-[128px]:size-3.5 @max-[128px]:rounded-[4px] @max-[128px]:px-0",
        INK[kind],
      )}
    >
      <Glyph strokeWidth={2.5} className="hidden size-2.5 @max-[128px]:block" />
      <span className="@max-[128px]:hidden">{kind}</span>
    </span>
  )
}
