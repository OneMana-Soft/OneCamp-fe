"use client"

/**
 * "Here now", the list the presence stack opens (B8; loaded on first open):
 * each person with what they are doing (Editing, Viewing, or Idle after 2
 * minutes), and Jump to and Follow. Both go to the person's awareness client
 * (the tab they used last), found by its number, never by their name: two
 * people called Sam are two people, and each button names who it is for.
 * You are listed last, as "You", with nothing to jump to.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { collaboratorHue } from "@/lib/identityHue"
import { useDocBus } from "@/components/docEditor/registry/commandBus"
import { stateOf, usePresence } from "./store"
import { usePresenceControl } from "./control"
import type { ActiveUser } from "@/components/docEditor/ActiveUsersBar"

const WHAT: Record<string, string> = { editing: "Editing", viewing: "Viewing", idle: "Idle" }

export default function PresenceList({ users, onDone }: { users: ActiveUser[]; onDone(): void }) {
  const bus = useDocBus()
  const presence = usePresence(bus.docId)
  const control = usePresenceControl(bus.key)
  const self = presence?.self
  const rows = [...users.filter((u) => u.id !== self), ...users.filter((u) => u.id === self)]
  return (
    <ul data-presence-rows="">
      {rows.map((u) => {
        const person = presence?.people[u.id]
        const client = person?.clients[0]
        const state = stateOf(person, u.mode)
        const you = u.id === self
        const followed = client !== undefined && control?.following === client
        return (
          <li key={u.id} className="flex min-h-9 items-center gap-2 rounded-lg px-2 hover:bg-hover" data-presence-row={u.id}>
            <span
              aria-hidden="true"
              data-presence-hue={u.agent ? "agent" : collaboratorHue(u)}
              className={cn(u.agent ? "bg-[var(--agent-a1)]" : cn(HUE_CLASS[collaboratorHue(u)], "bg-[var(--hue-a1)]"), "h-3.5 w-0.5 shrink-0 rounded-[1px]")}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ui font-[450] text-ink">
                {u.name}
                {you && <span className="ml-1.5 text-meta font-normal text-ink-3">You</span>}
              </span>
              {state && (
                <span className={cn("flex items-center gap-1 text-meta", state === "idle" ? "text-camp-sun-ink" : "text-ink-3")} data-presence-state={state}>
                  <span aria-hidden="true" data-presence={state === "idle" ? "away" : "online"} className="presence-dot !static !size-2 !min-h-2 !min-w-2 shrink-0 [--presence-ring:var(--pop)]" />
                  {WHAT[state]}
                </span>
              )}
            </span>
            {!you && control && client !== undefined && (
              <span className="flex shrink-0 items-center gap-0.5">
                <RowButton
                  label={`Jump to ${u.name}`}
                  onClick={() => {
                    onDone()
                    control.jump(client)
                  }}
                >
                  Jump to
                </RowButton>
                <RowButton
                  label={followed ? `Stop following ${u.name}` : `Follow ${u.name}`}
                  pressed={followed}
                  onClick={() => {
                    onDone()
                    control.follow(followed ? null : client)
                  }}
                >
                  {followed ? "Following" : "Follow"}
                </RowButton>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RowButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-6 rounded-md px-2 text-meta font-medium outline-none transition-colors duration-[140ms] focus-visible:ring-2 focus-visible:ring-brand",
        pressed ? "bg-brand-muted text-brand-text" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  )
}
