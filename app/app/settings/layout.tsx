"use client"

import { usePathname } from "next/navigation"
import { PageFrame } from "@/components/ui/settingsPage"
import { useJumpFlash } from "@/hooks/useJumpFlash"

/**
 * One frame for every settings page (design v3, admin §1.2): the 720px
 * column, 40px from the top, so the title is in the same place whichever
 * section is open. The settings nav in the sidebar is the way between
 * sections (and "Back to app" the way out), so the page carries no link back
 * to a list of them; a phone's top bar has its own Back.
 *
 * A search hit or a link with a #card scrolls to that card and flashes it.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ""
  useJumpFlash(pathname)
  return <PageFrame key={pathname}>{children}</PageFrame>
}
