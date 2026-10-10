"use client"

import MyAssistantsCard from "@/components/ai/MyAssistantsCard"
import { FEATURE_AI, useFeatureState } from "@/hooks/useClientConfig"
import { SectionHeader } from "../SectionHeader"
import { SectionLoading } from "../SectionLoading"

const HREF = "/app/settings/assistants"

export default function AssistantsSettingsPage() {
  // "Not yet known" is not "no AI here": read as a yes or no, this page said
  // the workspace runs without AI until its config arrived.
  const ai = useFeatureState(FEATURE_AI)

  return (
    <div className="space-y-10">
      <SectionHeader href={HREF}>
        {ai === "unavailable" ? "This workspace runs without AI, so there are no assistants to connect." : null}
      </SectionHeader>
      {ai === "unknown" ? <SectionLoading label="Loading your AI assistants" /> : ai === "available" ? <MyAssistantsCard withTitle={false} /> : null}
    </div>
  )
}
