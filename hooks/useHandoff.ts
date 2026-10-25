"use client"

import { useEffect, useState } from "react"

/**
 * A value staged for a component about to open (a picker's question, the
 * page a Move to… dialog moves): read as it first renders, and let go only
 * once that render is shown. React may throw a first render away and run it
 * again (a part that suspends, an urgent update cutting in), so a value taken
 * while rendering was gone for the render that showed: a picker closed
 * unseen, and Move to… moved the open doc instead of the page staged.
 * `release` is a module's own function (stable), and lets go of that value only.
 */
export function useHandoff<T>(peek: () => T | null, release: (value: T) => void): T | null {
  const [value] = useState(peek)
  useEffect(() => {
    if (value !== null) release(value)
  }, [value, release])
  return value
}
