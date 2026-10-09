"use client"

// A channel opened to write in.
//
// A new member lands on their first channel with compose=1 in the address
// (lib/landing.ts). This reads it once for that channel, then drops it from
// the address, so a reload or Back does not put the cursor there again, and
// another channel opened afterwards is not affected.
//
// The address is rewritten through the history API, which the router follows,
// rather than router.replace: this runs inside every channel view, including
// one rendered beside another page, and needs nothing from the router to work.

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { COMPOSE_PARAM, composeRequested, isChannelPage } from "@/lib/landing"

/** Whether this channel was opened to write in, so its message box should take the cursor. */
export function useComposeOnArrival(channelId: string): boolean {
  const params = useSearchParams()
  const pathname = usePathname()
  // Only on this channel's own page: a channel open beside another page is
  // not the one the address asks for.
  const asked = composeRequested(new URLSearchParams(params?.toString() ?? "")) && isChannelPage(pathname, channelId)
  const [arrivedIn, setArrivedIn] = useState<string | null>(null)

  useEffect(() => {
    if (!asked) return
    setArrivedIn(channelId)
    const rest = new URLSearchParams(window.location.search)
    rest.delete(COMPOSE_PARAM)
    const q = rest.toString()
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`)
  }, [asked, channelId])

  return arrivedIn !== null && arrivedIn === channelId
}
