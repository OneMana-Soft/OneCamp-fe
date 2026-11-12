import { useState } from "react"

/**
 * True from the first render `on` holds, and for good after: what opened once
 * stays drawn, to close with its motion. Set while rendering, so no effect.
 */
export function useLatch(on: boolean): boolean {
  const [held, hold] = useState(on)
  if (on && !held) hold(true)
  return held || on
}
