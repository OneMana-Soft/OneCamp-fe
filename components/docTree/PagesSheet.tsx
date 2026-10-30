"use client"

// The phone's page tree (docs programme B5): what the sidebar's Docs section
// is on a wide screen, as a tall sheet from the docs home's app bar. Rows are
// a finger's height, their "+" and "⋯" always shown (there is no hover), and
// opening a page closes the sheet: it goes with the old page as the address
// changes, so a tap only navigates. Closing it in the tap's own work rendered
// the whole docs home again inside the tap (fluid-06: the phone's doc-open
// INP was 256 ms against 100).
//
// Opened in 300 ms (fluid-06, Fix 3): its code and its groups' first levels
// are warmed on the docs home's quiet (pagesSheetWarm, warmLevels), so the
// tap fetches nothing; the frame the sheet begins to rise in draws only the
// sheet and a skeleton, the first group (the first screen) mounts once the
// slide is under way, and the others once the sheet has landed, all from the
// cache. On beta it opened in 637 ms, its chunk and three levels read on the
// tap and every row built in the slide's first frame; with the groups a frame
// apart, all inside the slide, in 428 ms (LEAD-6, 21 Oct).

import * as React from "react"
import { usePathname } from "next/navigation"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import DocsTreeGroups from "@/components/docTree/DocsTreeGroups"
import { DocTreeSkeleton } from "@/components/docTree/DocsSection"
import { TREE_CAP, adapterFor } from "@/components/docTree/DocTree"
import { warmRowMenu } from "@/components/docTree/DocRowActions"
import { prefetchLevel, readLimit } from "@/components/tree/useTree"
import type { DocSpace } from "@/types/docGraph"

/** The sheet's groups, in the order it shows them. */
const SPACES: DocSpace[] = ["workspace", "shared", "private"]

/** The sheet's groups' first levels, read ahead into the tree's cache (the docs home's quiet). */
export function warmLevels(): void {
  for (const space of SPACES) prefetchLevel(adapterFor(space), null, readLimit(TREE_CAP))
}

/**
 * What the sheet's taps need, on the docs home's quiet: its groups' first
 * levels, and its rows' menu (a finger's "⋯" or long press has no pointer
 * resting first to fetch it ahead).
 */
export function warmSheet(): void {
  warmLevels()
  warmRowMenu()
}

/** How long the sheet's rise takes (vaul's slide, 0.5 s), and a little more: when it has landed without saying so. */
export const LAND_MS = 650

/**
 * The sheet's groups, in their turn: none in the frame the sheet starts
 * rising in; the first group two frames in, when the slide is under way; the
 * others once it has landed (its rise's end, which the sheet passes on, or a
 * rise's time: motion reduced, or no end reported). Its own component, with
 * its own state, so a step renders the groups and not the sheet around them.
 */
function StagedGroups({ landing }: { landing: React.MutableRefObject<(() => void) | null> }) {
  const [started, setStarted] = React.useState(false)
  const [landed, setLanded] = React.useState(false)
  React.useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setStarted(true))
    })
    const land = () => setLanded(true)
    landing.current = land
    const late = window.setTimeout(land, LAND_MS)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(late)
      landing.current = null
    }
  }, [landing])
  return started ? <DocsTreeGroups groups={landed ? SPACES.length : 1} /> : <DocTreeSkeleton rows={6} />
}

export default function PagesSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [opened] = React.useState(pathname)
  // Its rise's end, passed to the groups waiting for it.
  const landing = React.useRef<(() => void) | null>(null)
  // A page opened from the tree: the sheet goes with the old page.
  React.useEffect(() => {
    if (pathname !== opened) onClose()
  }, [pathname, opened, onClose])

  return (
    <Drawer detent="large" open onOpenChange={(o) => !o && onClose()}>
      <DrawerContent data-pages-sheet="" className="flex flex-col" onAnimationEnd={(e) => e.target === e.currentTarget && landing.current?.()}>
        <DrawerTitle className="px-4 pb-2 pt-2 text-title-3 text-ink">Pages</DrawerTitle>
        {/* A finger's rows: 44 px, where the sidebar's are 28. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 [&_.shell-row]:!h-11 [&_[data-docs-group]>div:first-child]:h-8">
          <StagedGroups landing={landing} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
