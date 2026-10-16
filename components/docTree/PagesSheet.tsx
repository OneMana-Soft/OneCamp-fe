"use client"

// The phone's page tree (docs programme B5): what the sidebar's Docs section
// is on a wide screen, as a tall sheet from the docs home's app bar. Rows are
// a finger's height, their "+" and "⋯" always shown (there is no hover), and
// opening a page closes the sheet.

import * as React from "react"
import { usePathname } from "next/navigation"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import DocsTreeGroups from "@/components/docTree/DocsTreeGroups"

export default function PagesSheet({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [opened] = React.useState(pathname)
  // A page opened from the tree: the sheet goes with the old page.
  React.useEffect(() => {
    if (pathname !== opened) onClose()
  }, [pathname, opened, onClose])

  return (
    <Drawer detent="large" open onOpenChange={(o) => !o && onClose()}>
      <DrawerContent data-pages-sheet="" className="flex flex-col">
        <DrawerTitle className="px-4 pb-2 pt-2 text-title-3 text-ink">Pages</DrawerTitle>
        {/* A finger's rows: 44 px, where the sidebar's are 28. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 [&_.shell-row]:!h-11 [&_[data-docs-group]>div:first-child]:h-8">
          <DocsTreeGroups onOpened={onClose} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
