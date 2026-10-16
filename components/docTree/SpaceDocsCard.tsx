"use client"

// The team page's Docs card's heading (docs programme B5), titled as its
// Projects and Members cards are, and what stands in while the card's own
// code arrives: the same heading over rows at the tree's height, so the card
// doesn't jump in when it loads. Static on the team page; the tree is
// SpaceDocs' chunk.

import * as React from "react"

import { DocTreeSkeleton } from "@/components/docTree/DocsSection"
import { CardHeader, CardTitle } from "@/components/ui/card"
import { FileText } from "@/lib/icons"

export function SpaceDocsCardHeader({ children }: { children?: React.ReactNode }) {
  return (
    <CardHeader className="px-0 pb-6 pt-0">
      <div className="mb-1 flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-1.5">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <CardTitle as="h2" className="flex-1 text-xl font-bold tracking-tight">
          Docs
        </CardTitle>
        {children}
      </div>
    </CardHeader>
  )
}

export function SpaceDocsCardFallback() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-space-docs-fallback="">
      <SpaceDocsCardHeader />
      <DocTreeSkeleton rows={4} />
    </div>
  )
}
