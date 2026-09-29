"use client"

import MyAssistantsCard from "@/components/ai/MyAssistantsCard"
import { useAIAvailable } from "@/hooks/useClientConfig"

export default function AssistantsSettingsPage() {
  const aiAvailable = useAIAvailable()

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      {aiAvailable ? (
        <MyAssistantsCard />
      ) : (
        <p className="rounded-2xl border border-border/60 px-6 py-12 text-center text-sm text-muted-foreground">
          This workspace runs without AI, so there are no assistants to connect.
        </p>
      )}
    </div>
  )
}
