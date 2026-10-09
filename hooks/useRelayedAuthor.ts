"use client"

import { useMemo } from "react"
import { useBotKind } from "@/hooks/useBotKinds"
import { relayedAuthorOf, type RelayedAuthor } from "@/lib/relayedAuthor"

/**
 * The person behind a message, when the Guests or Slack bot posted it (see
 * lib/relayedAuthor): their name, their words and which relay, or null for
 * everyone else.
 */
export function useRelayedAuthor(
  from: { user_uuid?: string; is_bot?: boolean } | null | undefined,
  html: string | null | undefined,
): RelayedAuthor | null {
  const kind = useBotKind(from?.user_uuid, !!from?.is_bot)
  return useMemo(() => relayedAuthorOf(kind, html), [kind, html])
}
