"use client"

import type { ReactNode } from "react"
import { PageFrameHeader } from "@/components/ui/settingsPage"
import { settingsSection } from "@/lib/settingsSections"

/**
 * The top of a settings section's page (design v3, admin §1.2): its 36px
 * tile in the section's own hue, its name as the page's one h1 in title-1,
 * and one line under it, the section's own unless the page says better.
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
  // In a wrapper: a page spaces its blocks with space-y, which sets each
  // block's bottom margin, and the header's own margin would fight it.
  return (
    <div data-section-header-wrap="">
    <PageFrameHeader
      hue={section.hue}
      icon={section.icon}
      title={section.label}
      description={children ?? section.description}
      actions={actions}
      className="!mb-0"
    />
    </div>
  )
}
