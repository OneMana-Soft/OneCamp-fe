"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/ui/pageHeader"
import { useCapabilities } from "@/hooks/useCapabilities"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { visibleSettingsSections } from "@/lib/settingsSections"

export default function SettingsPage() {
  const { can } = useCapabilities()
  const sections = visibleSettingsSections(can, useAIAvailable())
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
      <PageHeader eyebrow="Yours" title="Settings" />
      <nav aria-label="Settings" className="divide-y divide-border/60 rounded-lg border border-border/60">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-4 px-4 py-3.5 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{s.label}</span>
              <span className="block text-sm text-muted-foreground text-pretty">{s.description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  )
}
