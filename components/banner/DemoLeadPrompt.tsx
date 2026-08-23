"use client"

// Offers a demo visitor the install command, in exchange for an address.
//
// WHY. The demo is one shared account, so a visitor arrives, looks around, and
// leaves without trace: no signup, no email, nobody to follow up with. Over a
// thousand people reached the site in three months and not one of them could be
// contacted afterwards. Somebody who has spent ten minutes inside the product is
// the warmest contact this business gets, and until now they left anonymously.
//
// DEMO ONLY. Gated on NEXT_PUBLIC_DEMO_MODE, the same flag that already decides
// whether the "Try Demo" button exists, so a customer's own workspace never
// renders it. It is also inert without NEXT_PUBLIC_SUBSCRIBE_URL, so even with
// demo mode on by accident it cannot post anywhere it was not told to.
//
// AFTER A DELAY, not on arrival. A prompt in the first ten seconds interrupts the
// thing it is asking them to evaluate, and gets dismissed by someone who had not
// yet decided they liked it. It waits until they have stayed.
//
// DISMISSIBLE AND REMEMBERED, because a visitor who said no once and is asked
// again on every page has been told what this product thinks of them.

import { useEffect, useState } from "react"
import { X, Send } from "lucide-react"

const DISMISSED_KEY = "onecamp:demo-lead-dismissed"
const SHOW_AFTER_MS = 90_000

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true"
const SUBSCRIBE_URL = process.env.NEXT_PUBLIC_SUBSCRIBE_URL || ""

export function DemoLeadPrompt() {
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle")
  const [msg, setMsg] = useState("")

  useEffect(() => {
    if (!DEMO || !SUBSCRIBE_URL) return
    // localStorage throws in some privacy modes; a prompt is never worth an error.
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return
    } catch {
      /* treat as not dismissed */
    }
    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      /* it just reappears next visit, which is survivable */
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === "sending") return
    setState("sending")
    try {
      const res = await fetch(SUBSCRIBE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "demo" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.msg || "Could not save that. Try again?")
      setState("done")
      setMsg(data?.msg || "Sent. Check your inbox.")
      // Asked and answered: never prompt this person again.
      try {
        localStorage.setItem(DISMISSED_KEY, "1")
      } catch {
        /* ignore */
      }
    } catch (err) {
      setState("error")
      setMsg(err instanceof Error ? err.message : "Could not save that. Try again?")
    }
  }

  if (!visible) return null

  return (
    <div
      role="complementary"
      aria-label="Run this yourself"
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-4 shadow-lg"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      {state === "done" ? (
        <p className="pr-6 text-sm text-foreground">{msg}</p>
      ) : (
        <>
          <p className="pr-6 text-sm font-medium text-foreground">Want this on your own server?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This demo resets every night. I&apos;ll email you the install command so you can run your own.
          </p>
          <form onSubmit={submit} className="mt-3 flex gap-2">
            <label htmlFor="demo-lead-email" className="sr-only">
              Email address
            </label>
            <input
              id="demo-lead-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {state === "sending" ? "…" : "Send"}
            </button>
          </form>
          {state === "error" && <p className="mt-2 text-xs text-destructive">{msg}</p>}
        </>
      )}
    </div>
  )
}
