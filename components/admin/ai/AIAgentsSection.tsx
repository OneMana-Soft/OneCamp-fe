"use client"

import * as React from "react"
import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AdminCardSkeleton } from "@/components/admin/AdminCardSkeleton"
import { AISubTabPanel, AISubTabs } from "@/components/admin/ai/AISubTabs"
import { AI_CARD_TAB, aiSubTabFor, type AISubTab } from "@/components/admin/ai/aiTabs"
import { flashCard } from "@/hooks/useJumpFlash"

// Each sub-page is a chunk of its own, fetched when it is first opened (or
// when the pointer reaches the section in the settings nav, adminPreload), so
// opening AI & agents on Overview does not download the providers editor, the
// sandbox form and the drill (app/adminFirstLoad.test.ts).
const OverviewTab = dynamic(() => import("@/components/admin/ai/tabs/OverviewTab"), { loading: AdminCardSkeleton })
const ModelsTab = dynamic(() => import("@/components/admin/ai/tabs/ModelsTab"), { loading: AdminCardSkeleton })
const AgentsTab = dynamic(() => import("@/components/admin/ai/tabs/AgentsTab"), { loading: AdminCardSkeleton })
const GovernanceTab = dynamic(() => import("@/components/admin/ai/tabs/GovernanceTab"), { loading: AdminCardSkeleton })
const UsageTab = dynamic(() => import("@/components/admin/ai/tabs/UsageTab"), { loading: AdminCardSkeleton })
const AdvancedTab = dynamic(() => import("@/components/admin/ai/tabs/AdvancedTab"), { loading: AdminCardSkeleton })

/** Looks for a card a few times (its sub-page's code and data arrive on their own), then flashes it. */
function seekAndFlash(id: string) {
  let tries = 0
  const seek = () => {
    if (flashCard(id) || ++tries > 16) return
    window.setTimeout(seek, 200)
  }
  window.setTimeout(seek, 0)
}

/**
 * AI & agents (design v3, admin §A15): six sub-pages under one tab bar, where
 * there was one 7,000px column. The sub-page is in the URL (`&sub=models`), so
 * a reload, a shared link and Back keep it; a link to one of the section's
 * cards (`#ai-models-drill`) opens the sub-page that holds it and flashes it.
 */
export default function AIAgentsSection() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = useState<AISubTab>(() =>
    aiSubTabFor(params.get("sub"), typeof window !== "undefined" ? window.location.hash : ""),
  )

  // A ?sub= that changes under us (Back, a link inside the app) moves the tab.
  const subParam = params.get("sub")
  useEffect(() => {
    const next = aiSubTabFor(subParam, window.location.hash)
    setTab((t) => (t === next ? t : next))
  }, [subParam])

  // A jump to a card while the section is open (Search settings, a link on
  // this page): open its sub-page, then find and flash the card.
  useEffect(() => {
    const onHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      const owner = AI_CARD_TAB[id]
      if (!owner) return
      setTab(owner)
      seekAndFlash(id)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const choose = useCallback(
    (next: AISubTab) => {
      setTab(next)
      const q = new URLSearchParams(params.toString())
      q.set("tab", "ai-models")
      q.set("sub", next)
      // The #card belonged to the last sub-page; a chosen tab starts at its top.
      router.replace(`${pathname || "/app/admin"}?${q.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  return (
    <AISubTabs value={tab} onValueChange={choose}>
      <AISubTabPanel value="overview">
        <OverviewTab onOpenTab={choose} />
      </AISubTabPanel>
      <AISubTabPanel value="models">
        <ModelsTab />
      </AISubTabPanel>
      <AISubTabPanel value="agents">
        <AgentsTab />
      </AISubTabPanel>
      <AISubTabPanel value="governance">
        <GovernanceTab />
      </AISubTabPanel>
      <AISubTabPanel value="usage">
        <UsageTab />
      </AISubTabPanel>
      <AISubTabPanel value="advanced">
        <AdvancedTab />
      </AISubTabPanel>
    </AISubTabs>
  )
}
