"use client"

import { useEffect, useState } from "react"
import { signInAnswer } from "@/lib/auth/signInAnswer"

// What a page with no session may know of the workspace: the public sign-in
// answer's facts. Signed in, the app reads /config/client.

type Answer = Awaited<ReturnType<typeof signInAnswer>>

/** The answer; undefined until it comes. */
function useSignInAnswer(): Answer | undefined {
  const asks = Boolean(process.env.NEXT_PUBLIC_BACKEND_URL)
  const [answer, setAnswer] = useState<Answer | undefined>(asks ? undefined : null)
  useEffect(() => {
    if (!asks) return
    let live = true
    void signInAnswer().then((a) => live && setAnswer(a))
    return () => {
      live = false
    }
  }, [asks])
  return answer
}

export type Hosting = "self" | "cloud" | "demo"

/** Where the workspace runs (SHELL-05); null until the server says. */
export function useHosting(): Hosting | null {
  const said = useSignInAnswer()?.hosting
  return said === "self" || said === "cloud" || said === "demo" ? said : null
}

/** Whether mailed links (an invitation, a reset) can arrive; null until the server says. */
export function useEmailConfigured(): boolean | null {
  const said = useSignInAnswer()?.email_configured
  return typeof said === "boolean" ? said : null
}
