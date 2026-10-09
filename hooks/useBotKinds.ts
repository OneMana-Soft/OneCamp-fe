"use client"

// Which kind each bot is, by its uuid, so a name says "Agent" only when an AI
// is behind it, and "Bot" for the Check-in, Slack, channel-guest and
// automation accounts. A handful of accounts that rarely change: read once,
// early (the app shell asks), and again only for a bot the list doesn't know.

import { useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"

// A background read: no loading bar, and a failure leaves every bot tagged
// "Bot" rather than toasting.
const QUIET = { silent: true, suppressErrorToast: true } as never
const OPTIONS = { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }

// A bot made after the list was read (an agent's first post) isn't in it: ask
// again once for each, never on every render.
const askedAgain = new Set<string>()

function useBotKindsRequest(enabled: boolean) {
  return useFetch<{ data: Record<string, string> }>(enabled ? GetEndpointUrl.BotKinds : "", undefined, OPTIONS, QUIET)
}

/** Reads the list early, so it's in before the first message draws. */
export function useBotKinds() {
  useBotKindsRequest(true)
}

/** A bot's kind; undefined for a person, or while the list loads. */
export function useBotKind(userUUID: string | undefined, isBot: boolean | undefined): string | undefined {
  const { data, mutate } = useBotKindsRequest(!!isBot)
  const kinds = data?.data
  const kind = isBot && userUUID ? kinds?.[userUUID] : undefined
  useEffect(() => {
    if (!isBot || !userUUID || !kinds || kind || askedAgain.has(userUUID)) return
    askedAgain.add(userUUID)
    void mutate()
  }, [isBot, userUUID, kinds, kind, mutate])
  return kind
}

/**
 * Every bot's kind by uuid, for a list that names many authors at once (reply
 * avatars, the channel list, search); undefined while it loads. The same read
 * as useBotKind, so it is usually in already.
 */
export function useBotKindMap(): Record<string, string> | undefined {
  return useBotKindsRequest(true).data?.data
}
