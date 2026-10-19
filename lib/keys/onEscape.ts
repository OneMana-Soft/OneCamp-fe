import type { EscapeHandler, EscapeLayer } from "@/lib/keys/escape"

/** What answers Escape, by layer: the one Escape (lib/keys/escape) asks them in turn. */
export const answers: Record<EscapeLayer, EscapeHandler[]> = { drag: [], overlay: [], panel: [], page: [], toast: [] }

/** Answers Escape in `layer` until the returned function is called. */
export function onEscape(layer: EscapeLayer, answer: EscapeHandler): () => void {
  answers[layer].push(answer)
  return () => {
    const at = answers[layer].lastIndexOf(answer)
    if (at >= 0) answers[layer].splice(at, 1)
  }
}
