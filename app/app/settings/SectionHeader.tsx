"use client"

import type { ReactNode } from "react"
import { PageHeader } from "@/components/ui/pageHeader"
import { Tile } from "@/components/ui/graphics/Tile"
import { settingsSection } from "@/lib/settingsSections"

/**
 * The top of a settings section's page: its icon on a tile in the section's
 * own hue, the same tile the list of sections shows, beside its name as the
 * page's one h1. Every section opens with it, so moving from one to the next
 * changes the words and the colour and nothing else; four of the six had no
 * heading at all, and their first line sat at a different height.
 */
export function SectionHeader({
  href,
  children,
  actions,
}: {
  /** The section's address, as listed in lib/settingsSections. */
  href: string
  /** At most one line that says something the name does not. */
  children?: ReactNode
  actions?: ReactNode
}) {
  const section = settingsSection(href)
  if (!section) return null
  const Icon = section.icon
  return (
    <PageHeader
      title={
        <span className="inline-flex items-center gap-3">
          <Tile hue={section.hue} size="md">
            <Icon />
          </Tile>
          {section.label}
        </span>
      }
      actions={actions}
    >
      {children && <p className="max-w-[65ch] text-sm text-muted-foreground text-pretty">{children}</p>}
    </PageHeader>
  )
}
