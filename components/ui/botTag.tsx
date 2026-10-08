"use client"

import { PrincipalTag, botTagKind } from "@/components/ui/principalTag"
import { useBotKind } from "@/hooks/useBotKinds"

/** The tag beside a bot's name: "Agent" only when an AI is behind it. */
export function BotTag({ userUUID, className }: { userUUID?: string; className?: string }) {
  return <PrincipalTag kind={botTagKind(useBotKind(userUUID, true))} className={className} />
}
