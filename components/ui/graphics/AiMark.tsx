/**
 * OneCamp AI's face (foundation 2), and at work the same face breathing;
 * inside a control the AI is motifs' Spark; never sparkles or a spinner
 * (app/aiMarkGuard.test.ts). AI surfaces alone import it, so the AI-free
 * line leaves it out. Import by path, never via ./index (the shell's).
 */
import { cn } from "@/lib/utils/helpers/cn"

import { SPARK_PATH } from "./motifs"

export type AiMarkSize = 16 | 20 | 24 | 32 | 40

/** The agent square with the white spark: decorative, or an image named by `label`. `breathing` rests under reduced motion. */
export function AiMark({ size = 24, breathing = false, label, className }: { size?: AiMarkSize; breathing?: boolean; label?: string; className?: string }) {
  return (
    <span
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      data-ai-mark=""
      data-breathing={breathing ? "" : undefined}
      className={cn("avatar-agent grid shrink-0 place-items-center rounded-[32%]", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("fill-white", breathing && "hub-breathe")} style={{ width: size * 0.55, height: size * 0.55 }}>
        <path d={SPARK_PATH} />
      </svg>
    </span>
  )
}
