"use client"

// Opens a creation dialog named in the URL (?open=createProject), then drops
// the parameter, so a link from anywhere (the setup checklist, a doc, an
// email) can start the thing it describes. Only these dialogs: the parameter
// comes from a link, and a link shouldn't open arbitrary UI.

import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { openUI } from "@/store/slice/uiSlice"

export const OPENABLE_FROM_URL = ["createProject", "createChannel", "createTeam"] as const
type Openable = (typeof OPENABLE_FROM_URL)[number]

export const openableFromUrl = (raw: string | null): Openable | null =>
  (OPENABLE_FROM_URL as readonly string[]).includes(raw ?? "") ? (raw as Openable) : null

export function useOpenFromUrl() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const dispatch = useDispatch()
  const key = openableFromUrl(params.get("open"))
  useEffect(() => {
    if (!key) return
    dispatch(openUI({ key }))
    const rest = new URLSearchParams(params.toString())
    rest.delete("open")
    const q = rest.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [key, dispatch, params, pathname, router])
}
