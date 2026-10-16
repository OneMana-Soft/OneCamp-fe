"use client"

import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PublicGone } from "@/components/guest/publicStates"
import { openPalette } from "@/lib/ui/palette"
import { useModKey } from "@/hooks/useModKey"
import { app_home_path } from "@/types/paths"
import { useTabName } from "@/components/common/DocumentTitle"

/** What a broken link was probably after: its last segment, de-slugged. "q4-launch-plan" is "q4 launch plan". */
export function queryFromPath(path: string | null | undefined): string {
  const last = (path ?? "").split("?")[0].split("/").filter(Boolean).pop() ?? ""
  let text = last
  try {
    text = decodeURIComponent(last)
  } catch {
    /* keep it as it came */
  }
  // A bare id (a uuid, a long hex or number) says nothing a search could use.
  if (/^[0-9a-f-]{16,}$/i.test(text) || /^\d+$/.test(text)) return ""
  return text.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * A signed-in 404, inside the shell with the sidebar, drawn as every dead
 * link is (PublicGone, without the public frame): "This page doesn't exist
 * or was deleted", what probably happened, and two ways on: Home, or ⌘K with
 * the link's last words already typed (PG2-01: four designs for one moment).
 */
export function AppNotFound() {
  const mod = useModKey()
  const pathname = usePathname()
  // The tab says so too (QA SH-11): it said "OneCamp".
  useTabName("Page not found")
  return (
    <PublicGone
      frame={false}
      surface="not-found"
      noun="page"
      detail="The link may be old, or what it pointed to was deleted."
      back={{ label: "Go home", href: app_home_path }}
      more={
        <Button size="sm" variant="secondary" onClick={() => openPalette({ query: queryFromPath(pathname) })}>
          Search
          <kbd data-kbd-hint="" className="kbd ml-1">{mod === "⌘" ? "⌘K" : "Ctrl K"}</kbd>
        </Button>
      }
    />
  )
}
