"use client"

// A list row's switch saved the moment it flips (design-14: a tick and Undo).
// It springs back when the save fails; its tick is a chip just left of it, so
// nothing moves.

import * as React from "react"
import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { SavedTick, useSaveStatus, type SaveStatus } from "@/components/ui/saveStatus"

type Props = Omit<React.ComponentPropsWithoutRef<typeof Switch>, "checked" | "defaultChecked" | "onCheckedChange"> & {
  checked: boolean
  /** Saves; rejects when the server didn't take it. */
  onSave: (next: boolean) => Promise<unknown>
  /** The toast's words: "GitHub is off". */
  what: (next: boolean) => string
}

export function InstantSwitch({ checked, onSave, what, ...props }: Props) {
  const { status, run } = useSaveStatus()
  // Shown at once; the list's own answer takes over once it agrees.
  const [pending, setPending] = useState<boolean | null>(null)
  if (pending === checked) setPending(null)
  const change = async (next: boolean): Promise<boolean> => {
    setPending(next)
    const held = await run(() => onSave(next), { what: what(next), undo: () => change(!next) })
    if (!held) setPending(null)
    return held
  }
  return (
    <SwitchTick status={status}>
      <Switch {...props} checked={pending ?? checked} onCheckedChange={(v) => void change(v)} aria-busy={status.state === "saving" || undefined} />
    </SwitchTick>
  )
}

/** The tick beside a list switch whose row runs its own save. */
export function SwitchTick({ status, children }: { status: SaveStatus; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <SavedTick status={status} className="pointer-events-none absolute inset-y-0 right-full mr-1 whitespace-nowrap rounded-sm bg-[var(--raised)] pl-2 pr-1" />
      {children}
    </span>
  )
}
