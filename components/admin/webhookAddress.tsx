"use client"

import { RevealCard } from "@/components/admin/revealCard"
import { useCopy } from "@/components/ui/settingsControls"
import { apiUrl } from "@/lib/utils/apiUrl"

/**
 * Where an incoming webhook is posted to: the API's address, then its token.
 *
 * Through apiUrl, because the deployed API address ends in "/": the card used
 * to add its own and showed "…//webhook/incoming/…", which the API's router
 * does not match, so the URL an admin copied into another service failed. An
 * unset address is "" instead of an invented localhost.
 */
export const incomingUrl = (token: string) => apiUrl(`webhook/incoming/${token}`)

/**
 * A new incoming webhook's address, shown once with Copy: its token is kept
 * only as its hash (audit A1), so the answer that made it is the one place it
 * can be read. With no API address set on this server, the token alone.
 */
export function AddressReveal({ token }: { token: string }) {
  const { state, copy } = useCopy()
  const address = incomingUrl(token)
  const secret = address || token
  return <RevealCard secret={secret} what={address ? "address" : "token"} copied={state === "copied"} copyFailed={state === "failed"} onCopy={() => void copy(secret)} />
}
