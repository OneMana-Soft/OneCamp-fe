"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { AuthAvatar } from "@/components/auth/AuthShell"

const SEEN = "oc_welcome_card_seen"

/** Whether this browser has shown the welcome card already. Storage that refuses reads as seen. */
export function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1"
  } catch {
    return true
  }
}

function markWelcomeSeen() {
  try {
    localStorage.setItem(SEEN, "1")
  } catch {
    /* nowhere to keep it */
  }
}

/** What the three chips put in the message box. */
export const WELCOME_SUGGESTIONS = [
  { label: "👋 Hi all", text: "👋 Hi all" },
  { label: "Introduce yourself", text: "Hi, I'm new here. A bit about me: " },
  { label: "Ask a question", text: "Quick question: " },
] as const

export interface WelcomePerson {
  id: string
  name: string
}

/**
 * The new member's welcome (design v3, admin.md E5): on the first landing in
 * their channel only, a card at the top of the feed (r12, e1, raised) with
 * the channel's people (22px, up to five), "Welcome to #general, Priya",
 * who is here, and three chips that fill the message box. Shown once per
 * browser; when the first message goes (`sent`), it collapses away
 * (opacity and scale .98, 180ms) and is not shown again.
 *
 * Built as its own component so the channel feed takes it with one line
 * (the chat branch is rewriting that feed): render it as the feed's first
 * item when useComposeOnArrival is true, pass the channel's people, and
 * point `onSuggest` at the composer.
 */
export function WelcomeCard({
  channelName,
  me,
  people,
  total,
  sent = false,
  onSuggest,
}: {
  channelName: string
  me: string
  people: WelcomePerson[]
  /** Everyone in the channel, when more than `people` were loaded. */
  total?: number
  sent?: boolean
  onSuggest: (text: string) => void
}) {
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (welcomeSeen()) return
    setShown(true)
    markWelcomeSeen()
  }, [])

  useEffect(() => {
    if (!sent || !shown) return
    setLeaving(true)
    const t = window.setTimeout(() => setShown(false), 180)
    return () => window.clearTimeout(t)
  }, [sent, shown])

  if (!shown) return null
  const others = people.filter((p) => p.name !== me)
  const count = Math.max(total ?? people.length, people.length) - 1
  const named = others.slice(0, 2).map((p) => p.name.split(" ")[0])
  const rest = count - named.length
  const who =
    named.length === 0
      ? "You're the first one here."
      : `${named.join(named.length === 2 && rest <= 0 ? " and " : ", ")}${rest > 0 ? ` and ${rest} ${rest === 1 ? "other" : "others"}` : ""} ${count === 1 ? "is" : "are"} here.`
  const first = me.split(" ")[0]
  return (
    <section className="welcome-card" data-leaving={leaving ? "" : undefined} aria-label="Welcome" data-welcome-card="">
      {others.length > 0 && (
        <div className="welcome-stack mb-3" aria-hidden="true">
          {others.slice(0, 5).map((p) => (
            <AuthAvatar key={p.id} seed={p.id} initials={p.name.split(/\s+/).map((w) => w[0]).join("")} size={22} />
          ))}
        </div>
      )}
      <h2 className="text-heading">
        Welcome to #{channelName}
        {first ? `, ${first}` : ""}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Say hello. {who}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {WELCOME_SUGGESTIONS.map((s) => (
          <Button key={s.label} variant="secondary" size="sm" onClick={() => onSuggest(s.text)}>
            {s.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
