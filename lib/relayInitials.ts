import { getNameInitials } from "@/lib/utils/getNameInitials"

/**
 * A relayed person's initials, from their name without anything in brackets:
 * "Priya (Acme)" is "P", not "P(". Pure.
 */
export function relayInitials(name: string): string {
  const bare = name.replace(/\([^)]*\)/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ")
  return getNameInitials(bare) || "?"
}
