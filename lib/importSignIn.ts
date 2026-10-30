// Coming back to the import page from signing in at a provider (Basecamp):
// the server's callback adds connected=<provider>, or connect_error=<code>
// and provider=<provider>. Pure.

import { importProviderLabel } from "@/services/importService"

export interface SignInReturn {
  provider: string
  ok: boolean
  title: string
  description?: string
  /** The address's query without the sign-in's own parameters. */
  search: string
}

const WHY: Record<string, string> = {
  cancelled: "The sign-in was cancelled, so nothing changed.",
  sign_in_expired: "The sign-in took too long or was already used. Connect again.",
  token_rejected: "It didn't accept the sign-in. Connect again.",
  // A token that takes one more step after signing in (Jira's: which site) couldn't take
  // it. The words fit each way it fails: no site listed, none seen, the address typed
  // not reached, or several reached and none named.
  sign_in_incomplete: "The sign-in couldn't settle which site to import from. Connect again with the site's address, or with an account that can see it.",
}

export function signInReturn(search: string): SignInReturn | null {
  const q = new URLSearchParams(search)
  const connected = q.get("connected")
  const error = q.get("connect_error")
  if (!connected && !error) return null
  const provider = connected || q.get("provider") || ""
  for (const k of ["connected", "connect_error", "provider"]) q.delete(k)
  const rest = q.toString()
  const name = provider ? importProviderLabel(provider) : "The tool"
  return connected
    ? { provider, ok: true, title: `${name} connected`, description: "Pick what to import below.", search: rest ? `?${rest}` : "" }
    : { provider, ok: false, title: `${name} wasn't connected`, description: WHY[error ?? ""] ?? "Something went wrong signing in. Connect again.", search: rest ? `?${rest}` : "" }
}
