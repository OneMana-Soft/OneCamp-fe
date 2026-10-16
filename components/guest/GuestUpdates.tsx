"use client"

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { useState } from "react"
import type { GuestUpdate } from "@/services/guestService"
import { daysAgo } from "@/lib/utils/relativeTime"
import { HealthWord } from "@/components/projectUpdates/HealthPill"
import { healthColor } from "@/components/projectUpdates/healthTone"
import { UpdateText } from "@/components/projectUpdates/UpdateText"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"

/**
 * The project's updates its team shared with the client (design v3, work.md
 * W51, W27): the newest as the feature card, with a band in its health's
 * colour, the earlier ones a click away. It is how an agency tells a client
 * where the work stands without writing an email.
 */
export function GuestUpdates({ updates }: { updates: GuestUpdate[] }) {
  const [all, setAll] = useState(false)
  if (updates.length === 0) return null
  const now = Date.now()
  const shown = all ? updates : updates.slice(0, 1)
  return (
    <section aria-label="Updates from the team" className="flex flex-col gap-3">
      {shown.map((u, i) => (
        <article key={`${u.created_at}-${i}`} data-update-variant={i === 0 ? "feature" : "card"} className="relative overflow-hidden rounded-2xl bg-raised p-5 pt-6 shadow-e1">
          <span aria-hidden="true" data-health-band="" className="absolute inset-x-0 top-0 h-1" style={{ background: healthColor(u.health) }} />
          <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <HealthWord health={u.health} />
            <p className="flex items-center gap-2 text-xs text-ink-3">
              <IdentityMark variant="avatar" id={avatarSeed(u.author)} label={u.author} size={24} />
              <span className="font-medium text-foreground">{u.author}</span> · {daysAgo(u.created_at, now)}
            </p>
          </header>
          <UpdateText body={u.body} className="text-body" />
        </article>
      ))}
      {updates.length > 1 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start rounded-sm text-xs font-medium text-ink-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
          {all ? "Show only the latest update" : `Show ${updates.length - 1} earlier ${updates.length === 2 ? "update" : "updates"}`}
        </button>
      )}
    </section>
  )
}
