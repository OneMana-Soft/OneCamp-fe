"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { SETTINGS_SECTIONS } from "@/lib/settingsSections"
import { kicker } from "@/components/ui/pageHeader"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Every settings section opens with a way back to the list of them, so moving
 * from Notifications to Connectors no longer means the command palette.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const inSection = SETTINGS_SECTIONS.some((s) => pathname?.startsWith(s.href))
  return (
    <>
      {inSection && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-6">
          <Link
            href="/app/settings"
            className={cn(kicker, "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70")}
          >
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
            Settings
          </Link>
        </div>
      )}
      {children}
    </>
  )
}
