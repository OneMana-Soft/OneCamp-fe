"use client"

import Link from "next/link"
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react"

/**
 * A link to a docs route with no live copy to fetch ahead: a folder, a file
 * or a link of Docs & Files (docs F1b), a comment thread, the docs home, the
 * trash. Its route is fetched when it is about to be opened (a pointer coming
 * over it, a focus, a touch), never on sight, as IntentLink fetches a page's:
 * a plain link fetched every one in a list as it came into view, on a phone
 * too. IntentLink's prefetchDoc would ask for a live copy these don't have.
 */
export const NodeLink = forwardRef<HTMLAnchorElement, Omit<ComponentPropsWithoutRef<typeof Link>, "prefetch">>(function NodeLink({ onPointerEnter, onFocus, onTouchStart, ...props }, ref) {
  // Once wanted, it stays wanted: the route is in the cache from then on.
  const [intent, setIntent] = useState(false)
  return (
    <Link
      ref={ref}
      {...props}
      prefetch={intent}
      data-prefetch={intent ? "intent" : "off"}
      onPointerEnter={(e) => {
        setIntent(true)
        onPointerEnter?.(e)
      }}
      onFocus={(e) => {
        setIntent(true)
        onFocus?.(e)
      }}
      onTouchStart={(e) => {
        setIntent(true)
        onTouchStart?.(e)
      }}
    />
  )
})
