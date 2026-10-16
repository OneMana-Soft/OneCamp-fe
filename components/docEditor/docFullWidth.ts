"use client"

import * as React from "react"

/** Where a person's own full width for a doc is kept in this browser: "1" or "0" once they choose. */
export const fullWidthKey = (docId: string) => `onecamp-doc-full-width:${docId}`

function read(docId: string): boolean | null {
  try {
    const v = localStorage.getItem(fullWidthKey(docId))
    return v === "1" ? true : v === "0" ? false : null
  } catch {
    return null
  }
}

/**
 * Full width (small-details V20, editor.md P0-6, D-7): the page's own
 * setting, kept on the doc (Customise page, B6), unless this person chose
 * otherwise in this browser (More's Full width), which they keep.
 */
export function useDocFullWidth(docId: string, pageDefault?: boolean): [boolean, () => void] {
  const [mine, setMine] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    setMine(read(docId))
  }, [docId])
  const wide = mine ?? !!pageDefault
  const toggle = React.useCallback(() => {
    const next = !wide
    try {
      localStorage.setItem(fullWidthKey(docId), next ? "1" : "0")
    } catch {
      /* a private window: for this visit only */
    }
    setMine(next)
  }, [docId, wide])
  return [wide, toggle]
}
