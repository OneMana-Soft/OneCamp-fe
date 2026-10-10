"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { SETTINGS_SECTIONS } from "@/lib/settingsSections"
import { kicker } from "@/components/ui/pageHeader"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * One frame for every settings page: the same width, gutters and top, so the
 * title is in the same place whichever section is open. Pages set none of
 * their own; each used to, at three different tops.
 *
 * A section's page opens with a way back to the list of them, in the place
 * the list's own kicker sits, so moving from Notifications to Connectors no
 * longer means the command palette.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const inSection = SETTINGS_SECTIONS.some((s) => pathname?.startsWith(s.href))
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      {inSection && (
        <div className="mb-1.5">
          <Link
            href="/app/settings"
            className={cn(kicker, "inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70")}
          >
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
            Settings
          </Link>
        </div>
      )}
      {children}
    </div>
  )
}
