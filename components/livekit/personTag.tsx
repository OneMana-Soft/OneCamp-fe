import { cn } from "@/lib/utils/helpers/cn"

// Invited (calls HU13) has no hue of its own.
const INK = { Guest: "bg-camp-sun-tint text-camp-sun-ink", Agent: "bg-agent-muted text-agent-ink", Invited: "bg-white/[0.12] text-[#D4D6DB]" } as const

/** Who someone is in a call, one shape in its own ink: on a tile's name plate and in the call's chat. */
export function PersonTag({ kind }: { kind: keyof typeof INK }) {
  return <span className={cn("inline-flex h-4 items-center rounded-[5px] px-1.5 text-micro", INK[kind])}>{kind}</span>
}
