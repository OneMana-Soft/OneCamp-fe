import { startTransition, useEffect, useState } from "react"

/**
 * False until a frame has painted after the first render where `armed`
 * holds, then true for good (a transition). Only react: lazy chunks use it.
 */
export function useAfterPaint(armed: boolean): boolean {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    if (!armed || painted) return
    let task = 0
    // A frame's callback runs before it paints; a task it queues, after.
    const frame = requestAnimationFrame(() => {
      task = window.setTimeout(() => startTransition(() => setPainted(true)))
    })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(task)
    }
  }, [armed, painted])
  return painted
}
