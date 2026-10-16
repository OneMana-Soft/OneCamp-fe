"use client"

import type { ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { inAppDepth } from "@/lib/navigation/back"
import { phoneSettingsTitle } from "@/lib/adminSections"

/**
 * Admin on a phone (design v3, admin A1): the top bar names the section that
 * is open, centred, because the page's own h1 is for screen readers there.
 * Every section said "Admin", so nothing on screen said which one it was.
 */
export function AdminPhoneTitle() {
  const pathname = usePathname() || ""
  const tab = useSearchParams()?.get("tab") ?? null
  return <>{phoneSettingsTitle(pathname, tab)}</>
}

/**
 * The top bar's left slot on Admin: the workspace's mark on the list of
 * sections (a tab's top level), and Back in a section, to the list it was
 * opened from, or to the list when there is nothing behind it in the app
 * (opened from a link). A section used to show the mark, so the way back was
 * the browser's gesture alone.
 */
export function AdminPhoneLeading({ mark }: { mark: ReactNode }) {
  const pathname = usePathname() || ""
  const tab = useSearchParams()?.get("tab")
  const router = useRouter()
  if (pathname === "/app/admin" && !tab) return <>{mark}</>
  return (
    <Button
      aria-label="Back"
      variant="ghost"
      size="icon"
      className="h-11 w-11"
      onClick={() => (inAppDepth() > 0 ? router.back() : router.push("/app/admin"))}
    >
      <ArrowLeft className="h-5" />
    </Button>
  )
}
