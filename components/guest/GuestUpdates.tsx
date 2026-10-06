"use client"

import { useState } from "react"
import type { GuestUpdate } from "@/services/guestService"
import { ago } from "@/lib/projectUpdates"
import { HealthPill } from "@/components/projectUpdates/HealthPill"
import { UpdateText } from "@/components/projectUpdates/UpdateText"

/**
 * The project's updates its team shared with the client: the newest open,
 * the earlier ones a click away. It is how an agency tells a client where the
 * work stands without writing an email.
 */
export function GuestUpdates({ updates }: { updates: GuestUpdate[] }) {
  const [all, setAll] = useState(false)
  if (updates.length === 0) return null
  const now = Date.now()
  const shown = all ? updates : updates.slice(0, 1)
  return (
    <section aria-label="Updates from the team" className="mb-5 flex flex-col gap-3">
      {shown.map((u, i) => (
        <article key={`${u.created_at}-${i}`} className="rounded-xl border border-border/60 bg-card p-4">
          <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <HealthPill health={u.health} />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{u.author}</span> · {ago(u.created_at, now)}
            </p>
          </header>
          <UpdateText body={u.body} />
        </article>
      ))}
      {updates.length > 1 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start text-xs font-medium text-muted-foreground hover:text-foreground">
          {all ? "Show only the latest update" : `Show ${updates.length - 1} earlier ${updates.length === 2 ? "update" : "updates"}`}
        </button>
      )}
    </section>
  )
}
