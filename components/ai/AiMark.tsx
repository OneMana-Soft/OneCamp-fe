/**
 * OneCamp AI's mark (hub.md AI1): the agent square, r 32% in the agent
 * gradient with the white spark at 55%. AI is agent identity in v3; the dusk
 * tile it replaces gave the assistant a feature colour of its own.
 *
 * `breathing` is the thinking state (AI6): the spark scales .86 to 1 and back
 * on 1.2 s, in place of every spinner the assistant had. Still under reduced
 * motion.
 */
import { SPARK_PATH } from "@/components/ui/graphics/motifs"
import { cn } from "@/lib/utils/helpers/cn"

export function AiMark({ size = 24, breathing = false, className }: { size?: number; breathing?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-ai-mark=""
      data-breathing={breathing ? "" : undefined}
      className={cn(
        "avatar-agent grid shrink-0 place-items-center rounded-[32%]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" className={cn("fill-white", breathing && "hub-breathe")} style={{ width: size * 0.55, height: size * 0.55 }}>
        <path d={SPARK_PATH} />
      </svg>
    </span>
  )
}
