"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { momentQuery, readMoment, withoutMoment, type CallMoment } from "@/lib/calls/callMoment"

/**
 * A recordings page opened at a call's moment (zoom-13: a search hit's link,
 * ?play=&at=): opens it once, then drops the moment from the address, the page
 * staying where it is, so closing the player doesn't open it again and reloading
 * shows the list. Opening asks the server again who may.
 */
export function useMomentLink(open: (moment: CallMoment) => void): void {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const moment = readMoment(params)
  const key = moment ? momentQuery(moment) : ""
  const opened = useRef("")
  useEffect(() => {
    if (!moment) {
      opened.current = ""
      return
    }
    if (opened.current === key) return
    opened.current = key
    open(moment)
    router.replace(withoutMoment(pathname, params), { scroll: false })
  }, [key, moment, open, pathname, params, router])
}

/** The hook as a part a conversation's recordings page mounts (the workspace's list has no moment to open). */
export function MomentLink({ open }: { open: (moment: CallMoment) => void }): null {
  useMomentLink(open)
  return null
}
