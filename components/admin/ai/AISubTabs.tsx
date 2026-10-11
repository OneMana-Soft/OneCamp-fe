"use client"

import * as React from "react"
import { useLayoutEffect, useRef } from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { AI_SUBTABS, type AISubTab } from "@/components/admin/ai/aiTabs"

/**
 * The tab bar under AI & agents' header (DESIGN_V3 tabs, admin §A15): 40px,
 * labels at 13.5 ink-2, the chosen one ink at 510 with a 2px ink underline.
 * The underline is ONE element that slides: moved by translateX and sized by
 * scaleX over 220ms on the spring, so no layout property animates
 * (motionCost.test.ts). Under reduced motion the global rule makes it jump.
 * On a phone the row scrolls sideways and the chosen tab is brought into view.
 *
 * Radix tabs, so the arrow keys move between them and each says "tab, 2 of 6".
 */
export function AISubTabs({
  value,
  onValueChange,
  children,
}: {
  value: AISubTab
  onValueChange: (v: AISubTab) => void
  children: React.ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const inkRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    const ink = inkRef.current
    if (!list || !ink) return
    const place = () => {
      const tab = list.querySelector<HTMLElement>("[data-state='active']")
      if (!tab || tab.offsetWidth === 0) {
        ink.style.opacity = "0"
        return
      }
      ink.style.opacity = "1"
      ink.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth})`
    }
    place()
    list.querySelector<HTMLElement>("[data-state='active']")?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(place)
    ro.observe(list)
    return () => ro.disconnect()
  }, [value])

  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as AISubTab)} className="min-w-0" data-ai-subtabs="">
      <div className="ai-tabs-bar">
        <TabsPrimitive.List ref={listRef} aria-label="AI & agents" className="ai-tabs-list no-scrollbar">
          {AI_SUBTABS.map((t) => (
            <TabsPrimitive.Trigger key={t.value} value={t.value} className="ai-tab" data-ai-subtab={t.value}>
              {t.label}
            </TabsPrimitive.Trigger>
          ))}
          <span ref={inkRef} aria-hidden="true" data-ai-tab-ink="" className="ai-tab-ink" />
        </TabsPrimitive.List>
      </div>
      {children}
    </TabsPrimitive.Root>
  )
}

/** One sub-page's body, mounted only while its tab is chosen. */
export function AISubTabPanel({ value, children }: { value: AISubTab; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Content value={value} className="mt-8 outline-none" data-ai-panel={value}>
      {children}
    </TabsPrimitive.Content>
  )
}
