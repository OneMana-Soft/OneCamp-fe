"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/ui/pageHeader"
import { Tile } from "@/components/ui/graphics/Tile"
import { Skeleton } from "@/components/ui/skeleton"
import { useCapabilities } from "@/hooks/useCapabilities"
import { SETTINGS_SECTIONS, sectionAccess } from "@/lib/settingsSections"

/**
 * A person's settings sections, each on its own hue's tile. A row that waits
 * on this person's permissions or on whether the server has AI holds its
 * place until the answer is in: Workflows and Agents used to insert themselves
 * above API tokens a moment after the page drew, moving the row under the
 * pointer.
 */
export default function SettingsPage() {
  const { can, isLoading } = useCapabilities()
  // This edition has no AI, so its sections never show.
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Yours" title="Settings" />
      <nav aria-label="Settings">
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {SETTINGS_SECTIONS.map((s) => {
            const access = sectionAccess(s, { can, capabilitiesKnown: !isLoading, ai: "unavailable" })
            if (access === "hidden") return null
            if (access === "unknown") {
              return (
                <li key={s.href} aria-hidden="true" className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-2/3" />
                  </span>
                </li>
              )
            }
            const Icon = s.icon
            return (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
                >
                  <Tile hue={s.hue} size="md">
                    <Icon />
                  </Tile>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-medium leading-5 text-foreground">{s.label}</span>
                    <span className="block text-xs text-muted-foreground text-pretty">{s.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
