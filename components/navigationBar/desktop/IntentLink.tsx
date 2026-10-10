"use client"

import Link from "next/link"
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react"

/**
 * A sidebar link that prefetches its route on intent, not on sight.
 *
 * Every sidebar link prefetched its whole route as soon as it was on screen,
 * so opening Home loaded the code of every place in the sidebar, about
 * 1.75 MB gzip on a cold cache, most of it for pages nobody opened. A desktop
 * gives notice before a click: the pointer comes over the link, or the
 * keyboard reaches it, a few hundred milliseconds ahead. The route is fetched
 * then, as fully as before. A touch on a tablet counts too, since it lands
 * before the click.
 *
 * The phone's tab bar keeps prefetching on sight: a thumb gives no notice.
 */
export const IntentLink = forwardRef<HTMLAnchorElement, Omit<ComponentPropsWithoutRef<typeof Link>, "prefetch">>(
  function IntentLink({ onPointerEnter, onFocus, onTouchStart, ...props }, ref) {
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
  },
)
