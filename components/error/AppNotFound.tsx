"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SpotOrbit } from "@/components/error/shellSpots"
import { openPalette } from "@/lib/ui/palette"
import { useModKey } from "@/hooks/useModKey"
import { app_home_path } from "@/types/paths"

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
 * A signed-in 404, inside the shell with the sidebar (design v3, shell §L4,
 * mock M6): the orbit spot, a light title (the person did nothing wrong),
 * what probably happened, and two ways on: Home, or ⌘K with the link's last
 * words already typed.
 */
export function AppNotFound() {
  const mod = useModKey()
  const pathname = usePathname()
  return (
    <main id="main-content" data-app-not-found="" className="flex h-full min-h-0 flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <SpotOrbit />
      <h1 className="mt-3 text-title-3 font-semibold text-foreground">This page wandered off</h1>
      <p className="mt-1 max-w-[44ch] text-sm text-ink-2">The link may be old, or what it pointed to was deleted.</p>
      <div className="mt-3.5 flex items-center gap-2">
        <Button asChild size="sm">
          <Link href={app_home_path}>Go home</Link>
        </Button>
        <Button size="sm" variant="secondary" onClick={() => openPalette({ query: queryFromPath(pathname) })}>
          Search
          <kbd className="kbd ml-1">{mod === "⌘" ? "⌘K" : "Ctrl K"}</kbd>
        </Button>
      </div>
    </main>
  )
}
