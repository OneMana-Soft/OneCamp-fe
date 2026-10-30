"use client"

/**
 * Home's "What needs me now", wherever the rows come from (hub.md H8).
 *
 * With AI on, the AI's attention list (components/ai/AttentionCard) adds agent
 * requests and its own finds to the rows below and draws the section. With AI
 * off, or on the edition with none, the section still works: mentions waiting,
 * DMs and tasks due, which need nothing but the app. It used to vanish
 * whenever AI was off, so a team without AI had no queue on Home at all.
 */
import type { ReactNode } from "react"

import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig"
import { NeedsMeSection } from "@/components/home/NeedsMeSection"
import { SHARED_ACTIONS } from "@/components/home/needsActions"
import { useHomeNeeds } from "@/components/home/useHomeNeeds"
import type { NeedsItem } from "@/components/home/needsMe"

/** What Home hands the AI's part, so it can add its rows to these and draw the section. */
export interface NeedsAIProps {
  base: NeedsItem[]
  baseLoading: boolean
  footer?: ReactNode
  noChannels?: ReactNode
  className?: string
}

/**
 * `withAI` draws the AI's part (components/ai/AttentionCard), passed in by the
 * page so this shared file names nothing in components/ai: the edition without
 * AI has no such file, and its port drops the page's one import.
 */
export function NeedsMe({
  footer,
  noChannels,
  className,
  withAI,
}: {
  footer?: ReactNode
  noChannels?: ReactNode
  className?: string
  withAI?: (props: NeedsAIProps) => ReactNode
}) {
  const base = useHomeNeeds()
  const ai = useFeatureState(FEATURE_AI, { onFailure: "unavailable" })
  if (ai === "available" && withAI) {
    return <>{withAI({ base: base.items, baseLoading: base.loading, footer, noChannels, className })}</>
  }
  return (
    <NeedsMeSection
      items={base.items}
      loading={(ai === "unknown" && Boolean(withAI)) || base.loading}
      error={base.error}
      onRetry={base.retry}
      footer={footer}
      noChannels={noChannels}
      className={className}
      {...SHARED_ACTIONS}
    />
  )
}
