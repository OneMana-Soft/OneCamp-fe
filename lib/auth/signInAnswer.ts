import { within } from "@/lib/auth/probe"

/**
 * GET /auth/providers, the sign-in answer: which ways in this workspace has on,
 * its name, whether mailed links arrive and where it runs. Anyone may read it,
 * so it is asked without the session.
 *
 * It is asked once a load, whoever asks: the sign-in pages read its ways in
 * (AuthService.getEnabledProviders), every page its name
 * (hooks/useWorkspaceName), a signed-out page its facts (lib/auth/useSignInFacts).
 * An answer belongs to the fetch that brought it, so a test with its own fetch
 * is answered afresh. One that brought nothing is not kept.
 *
 * Null when nothing answered in time (lib/auth/probe) or wasn't a success.
 */
interface SignInAnswer {
  providers?: Record<string, unknown> | null
  workspace_name?: unknown
  email_configured?: unknown
  hosting?: unknown
}

let kept: { fetch: typeof fetch; answer: Promise<SignInAnswer | null> } | null = null

export function signInAnswer(): Promise<SignInAnswer | null> {
  const current = globalThis.fetch
  if (kept && kept.fetch === current) return kept.answer
  const entry = { fetch: current, answer: ask() }
  kept = entry
  void entry.answer.then((answer) => {
    if (!answer && kept === entry) kept = null
  })
  return entry.answer
}

async function ask(): Promise<SignInAnswer | null> {
  try {
    return await within(async (signal) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? ""}auth/providers`, { credentials: "omit", cache: "no-store", signal })
      if (!res.ok) return null
      return ((await res.json()) as SignInAnswer | null) ?? {}
    })
  } catch {
    // No answer, or none in time: each asker goes on without it.
    return null
  }
}
