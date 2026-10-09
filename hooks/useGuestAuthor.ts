"use client"

import { useMemo } from "react"
import { useBotKind } from "@/hooks/useBotKinds"
import { splitGuestLabel, type GuestAuthor } from "@/lib/guestAuthor"

/**
 * The guest behind a message, when the Guests bot posted it (see
 * lib/guestAuthor): their name and their words, or null for everyone else.
 * Only that bot's messages are read this way, so nobody else's bold
 * "[Name (guest)]" line can make them look like a guest.
 */
export function useGuestAuthor(
  from: { user_uuid?: string; is_bot?: boolean } | null | undefined,
  html: string | null | undefined,
): GuestAuthor | null {
  const kind = useBotKind(from?.user_uuid, !!from?.is_bot)
  return useMemo(() => (kind === "guest" ? splitGuestLabel(html) : null), [kind, html])
}
