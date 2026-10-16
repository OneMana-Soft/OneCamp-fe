"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, Lock, Search } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { useCapabilities } from "@/hooks/useCapabilities"
import { FEATURE_AI, FEATURE_CALLS, useFeatureState } from "@/hooks/useClientConfig"
import { sectionAccess } from "@/lib/settingsSections"
import {
  SETTINGS_GROUP_LABEL,
  SETTINGS_PLACES,
  placeForLocation,
  searchSettings,
  type SettingsGroupKey,
  type SettingsHit,
  type SettingsPlace,
} from "@/lib/adminSections"
import { useModKey } from "@/hooks/useModKey"
import { preloadAdminSection } from "@/components/admin/adminPreload"
import { flashCard } from "@/hooks/useJumpFlash"
import { cn } from "@/lib/utils/helpers/cn"
import { RailItem } from "@/components/navigationBar/desktop/SidebarRail"

/** Where "Back to app" goes: the last place outside settings, this session. */
const LAST_APP_ROUTE = "onecamp:last-app-route"

export function rememberAppRoute(route: string) {
  try {
    sessionStorage.setItem(LAST_APP_ROUTE, route)
  } catch {}
}

export function lastAppRoute(): string {
  try {
    return sessionStorage.getItem(LAST_APP_ROUTE) || "/app"
  } catch {
    return "/app"
  }
}

const GROUP_ORDER: SettingsGroupKey[] = ["you", "workspace", "ai", "connections", "records", "system"]

/**
 * Which places this person sees: "You" for everyone, the rest for admins.
 * A section they can't use is left out, unless it is the page they are on
 * (`here`, opened by its address): that one stays, locked, so the nav still
 * says where they are (QA SH-21).
 */
export function useSettingsPlaces(isAdmin: boolean, here?: string) {
  const { can, isLoading } = useCapabilities()
  const ai = useFeatureState(FEATURE_AI)
  const calls = useFeatureState(FEATURE_CALLS)
  return useMemo(() => {
    const out: { place: SettingsPlace; pending: boolean; locked?: boolean }[] = []
    for (const place of SETTINGS_PLACES) {
      if (place.group !== "you" && !isAdmin) continue
      if (place.settings) {
        const access = sectionAccess(place.settings, { can, capabilitiesKnown: !isLoading, ai })
        if (access === "hidden") {
          if (place.key === here) out.push({ place, pending: false, locked: true })
          continue
        }
        out.push({ place, pending: access === "unknown" })
        continue
      }
      const gate = place.gate === "ai" ? ai : place.gate === "calls" ? calls : "available"
      if (gate === "unavailable") continue
      out.push({ place, pending: gate === "unknown" })
    }
    return out
  }, [isAdmin, can, isLoading, ai, calls, here])
}

/**
 * The settings nav (design v3, admin §1.1, Linear's pattern): on any admin or
 * settings page it takes the sidebar's place, so Settings and Admin are one
 * place people learn once and the content gets the 208px the in-page menu
 * took.
 *
 * - "Back to app" at the top (Esc does the same when focus is not in a field)
 *   returns to the last place outside settings.
 * - "Search settings" (⌘ ,) filters live by section name, keyword and the
 *   titles of the cards inside; Enter opens the first hit and flashes its card.
 * - Rows are the sidebar's rows: 30px, a 16px glyph in ink-3, no tiles. The
 *   current one is the raised chip, one element that slides between rows on
 *   transform (220ms on the spring); under reduced motion it jumps.
 * - Non-admins see only "You".
 */
export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() || ""
  const params = useSearchParams()
  const router = useRouter()
  const current = placeForLocation(pathname, params?.get("tab") ?? null)
  const places = useSettingsPlaces(isAdmin, current?.key)
  const [query, setQuery] = useState("")
  const [back, setBack] = useState("/app")
  const searchRef = useRef<HTMLInputElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLDivElement>(null)
  const [chipReady, setChipReady] = useState(false)
  const placed = useRef(false)
  const mod = useModKey()

  useEffect(() => setBack(lastAppRoute()), [])

  const hits: SettingsHit[] = useMemo(
    () => searchSettings(query, places.filter((p) => !p.pending && !p.locked).map((p) => p.place)),
    [query, places],
  )

  // ⌘ , focuses the search; Esc outside a field goes back to the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "," && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key !== "Escape" || e.defaultPrevented) return
      const t = e.target instanceof Element ? e.target : null
      if (t && (t.closest("input,textarea,select,[contenteditable='true'],[role='dialog'],[role='menu'],[role='listbox']"))) return
      if (document.querySelector("[role='dialog'][data-state='open'],[role='alertdialog'][data-state='open']")) return
      router.push(lastAppRoute())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

  // The chip: measured to the current row, moved by transform.
  useLayoutEffect(() => {
    const rows = rowsRef.current
    const chip = chipRef.current
    if (!rows || !chip) return
    const place = () => {
      const row = rows.querySelector<HTMLElement>(".snav-row[aria-current='page']")
      if (!row || query) {
        chip.style.opacity = "0"
        return
      }
      chip.dataset.instant = placed.current ? "false" : "true"
      chip.style.opacity = "1"
      chip.style.transform = `translateY(${row.offsetTop}px)`
      placed.current = true
      setChipReady(true)
    }
    place()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    ro?.observe(rows)
    return () => ro?.disconnect()
  }, [current?.key, query, places])

  const openHit = (hit: SettingsHit) => {
    const href = hit.card ? `${hit.place.href}#${hit.card.id}` : hit.place.href
    setQuery("")
    router.push(href)
    // Already on that page: no remount to seek the card, so flash it now.
    const here = window.location.pathname + window.location.search
    if (hit.card && here === hit.place.href) window.setTimeout(() => flashCard(hit.card!.id), 50)
  }

  return (
    <div className="snav" data-settings-nav="">
      <IntentLink href={back} className="snav-back" aria-label="Back to app">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to app
      </IntentLink>
      <label className="snav-search">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          placeholder="Search settings"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) {
              e.preventDefault()
              openHit(hits[0])
            } else if (e.key === "Escape" && query) {
              e.preventDefault()
              e.stopPropagation()
              setQuery("")
            }
          }}
          className="text-sm [&::-webkit-search-cancel-button]:appearance-none"
          aria-label="Search settings"
        />
        {!query && (
          <span className="flex shrink-0 gap-0.5" aria-hidden="true">
            <kbd className="kbd">{mod}</kbd>
            <kbd className="kbd">,</kbd>
          </span>
        )}
      </label>
      <div className="shell-scroll -mx-2 px-2">
        {query ? (
          <nav aria-label="Settings search results" className="snav-rows mt-1.5" data-results="">
            {hits.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing in settings matches &ldquo;{query.trim()}&rdquo;.</p>
            ) : (
              hits.map((hit, i) => {
                const Icon = hit.place.icon
                return (
                  <button
                    key={`${hit.place.key}#${hit.card?.id ?? ""}`}
                    type="button"
                    data-hit={i === 0 ? "true" : undefined}
                    onClick={() => openHit(hit)}
                    className="snav-row w-full text-left"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      {hit.card ? (
                        <>
                          <span className="text-foreground">{hit.card.title}</span>
                          <span className="text-ink-3"> · {hit.place.label}</span>
                        </>
                      ) : (
                        hit.place.label
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </nav>
        ) : (
          <nav aria-label="Settings" ref={rowsRef} className="snav-rows" data-chip={chipReady ? "" : undefined}>
            <div ref={chipRef} className="snav-chip" aria-hidden="true" style={{ opacity: 0 }} />
            {GROUP_ORDER.map((group) => {
              const rows = places.filter((p) => p.place.group === group)
              if (rows.length === 0) return null
              return (
                <div key={group} role="group" aria-label={SETTINGS_GROUP_LABEL[group]} className="flex flex-col gap-px">
                  <p aria-hidden="true" className={cn("snav-sect text-2xs font-medium", group === "you" && "mt-1")}>
                    {SETTINGS_GROUP_LABEL[group]}
                  </p>
                  {rows.map(({ place, pending, locked }) => {
                    const Icon = place.icon
                    if (pending) {
                      return (
                        <span key={place.key} aria-hidden="true" data-nav-placeholder="" className="snav-row">
                          <span className="size-4 shrink-0 rounded-[5px] bg-press" />
                          <span className="h-3 w-24 rounded-sm bg-press" />
                        </span>
                      )
                    }
                    const active = current?.key === place.key
                    return (
                      <IntentLink
                        key={place.key}
                        href={place.href}
                        scroll={false}
                        aria-current={active ? "page" : undefined}
                        onPointerEnter={place.group !== "you" ? () => preloadAdminSection(place.key) : undefined}
                        onFocus={place.group !== "you" ? () => preloadAdminSection(place.key) : undefined}
                        className="snav-row"
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{place.label}</span>
                        {locked ? (
                          <>
                            <Lock className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                            <span className="sr-only">, locked</span>
                          </>
                        ) : null}
                      </IntentLink>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        )}
      </div>
    </div>
  )
}

/**
 * The settings nav folded into the rail (design v3, admin §1.1 and shell
 * S13): Back to app, then each section this person can open as a rail item,
 * grouped by hairlines, the current one the raised chip. Under 1024 the
 * sidebar starts as the rail, and in settings the rail showed the app's
 * places instead: no way to another settings section without widening the
 * sidebar. The rail's peek still opens the whole settings nav, search and all.
 */
export function SettingsRailItems({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() || ""
  const params = useSearchParams()
  const current = placeForLocation(pathname, params?.get("tab") ?? null)
  const places = useSettingsPlaces(isAdmin, current?.key)
  const [back, setBack] = useState("/app")
  useEffect(() => setBack(lastAppRoute()), [])
  return (
    <>
      <RailItem href={back} title="Back to app">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </RailItem>
      {GROUP_ORDER.map((group) => {
        const rows = places.filter((p) => p.place.group === group && !p.pending)
        if (rows.length === 0) return null
        return (
          <div key={group} role="group" aria-label={SETTINGS_GROUP_LABEL[group]} data-settings-rail-group={group} className="flex flex-col items-start gap-0.5">
            <span className="shell-rail-sep" aria-hidden="true" />
            {rows.map(({ place }) => {
              const Icon = place.icon
              return (
                <RailItem key={place.key} href={place.href} title={place.label} active={current?.key === place.key}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </RailItem>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
