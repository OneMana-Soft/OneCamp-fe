"use client"

import Link from "next/link"
import { ChevronRight } from "@/lib/icons"
import { Tile } from "@/components/ui/graphics/Tile"
import { SETTINGS_GROUP_LABEL, type SettingsGroupKey } from "@/lib/adminSections"
import { useSettingsPlaces } from "@/components/navigationBar/desktop/SettingsNav"

const ADMIN_GROUPS: SettingsGroupKey[] = ["workspace", "ai", "connections", "records", "system"]

/**
 * Admin on a phone (design v3, admin A1 and §1.1): the settings nav is its
 * own screen, the sections as grouped cards of 52px rows, each with its 28px
 * hue tile (here the tile names a destination, which identity may), the label
 * at 15/22 and a chevron. A section opens full screen with the platform's
 * back. It replaced a native select 44px tall.
 */
export function SettingsPhoneList() {
  const places = useSettingsPlaces(true)
  return (
    <main id="main-content" className="h-full min-h-0 overflow-y-auto px-4 pb-24 pt-4">
      <h1 className="sr-only">Admin</h1>
      <div className="space-y-6">
        {ADMIN_GROUPS.map((group) => {
          const rows = places.filter((p) => p.place.group === group && !p.pending)
          if (rows.length === 0) return null
          return (
            <section key={group} aria-label={SETTINGS_GROUP_LABEL[group]}>
              <h2 className="mb-1.5 px-3 text-2xs font-medium text-ink-3">{SETTINGS_GROUP_LABEL[group]}</h2>
              <ul className="set-card">
                {rows.map(({ place }) => {
                  const Icon = place.icon
                  return (
                    <li key={place.key} className="set-row !min-h-[52px] !p-0">
                      <Link
                        href={place.href}
                        className="flex min-h-[52px] items-center gap-3 px-3.5 active:bg-press focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        <Tile hue={place.hue} size="md" className="size-7 rounded-lg">
                          <Icon />
                        </Tile>
                        <span className="min-w-0 flex-1 truncate text-body text-foreground">{place.label}</span>
                        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </main>
  )
}
