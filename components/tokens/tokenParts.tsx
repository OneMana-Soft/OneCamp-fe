"use client"

import { useState, type Ref } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { useCopy } from "@/components/ui/settingsControls"
import { useConfirm } from "@/hooks/useConfirm"
import { shortDate } from "@/lib/utils/date/shortDate"
import { scopeLabel } from "@/services/apiTokenService"

/**
 * The parts every credential screen shares (design v3, admin S7): a person's
 * API tokens in their settings, and an app's tokens in Admin › Apps. The
 * scopes as grouped checkboxes, a token's dates in one line, and copying a
 * token shown once (its card is RevealCard, which webhooks share).
 */

/** What a scope is about, for grouping the checkboxes: "tasks:read" is Tasks. */
const GROUP_NAMES: Record<string, string> = {
  tasks: "Tasks",
  projects: "Projects",
  docs: "Documents",
  messages: "Messages",
  calendar: "Calendar",
  tables: "Tables",
  data_sources: "Data sources",
  attention: "Attention",
  search: "Search",
}

/** Scopes grouped by what they're about, in the order given. Pure. */
export function groupScopes(scopes: string[]): Array<{ name: string; scopes: string[] }> {
  const groups = new Map<string, string[]>()
  for (const s of scopes) {
    const key = s.split(":")[0]
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  return [...groups].map(([key, list]) => ({ name: GROUP_NAMES[key] ?? key, scopes: list }))
}

interface Dated {
  created_at: string
  last_used_at?: string | null
  expires_at?: string | null
}

const when = (iso: string) => shortDate(new Date(iso))

/** "Created 3 Oct · last used 9 Oct · expires 3 Jan". Pure. */
export function tokenDates(t: Dated): string {
  return [
    `Created ${when(t.created_at)}`,
    t.last_used_at ? `last used ${when(t.last_used_at)}` : "never used",
    t.expires_at ? `expires ${when(t.expires_at)}` : "no expiry",
  ].join(" · ")
}

/**
 * The scopes as checkboxes grouped by what they're about. `idPrefix` keeps two
 * lists on one screen apart (an app's own scopes, and a new token's).
 */
export function ScopeChecklist({
  available,
  selected,
  onToggle,
  labelledBy,
  describedBy,
  idPrefix,
  groupRef,
}: {
  available: string[]
  selected: ReadonlySet<string>
  onToggle: (scope: string, on: boolean) => void
  labelledBy: string
  describedBy?: string
  idPrefix: string
  groupRef?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={groupRef} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} data-scope-groups="" className="you-scope-groups">
      {groupScopes(available).map((g) => (
        <fieldset key={g.name} className="space-y-1.5">
          <legend className="mb-1 text-2xs font-medium text-ink-3">{g.name}</legend>
          {g.scopes.map((s) => {
            const id = `${idPrefix}-${s.replace(/[^\w-]/g, "-")}`
            return (
              <div key={s} className="flex items-center gap-2">
                <Checkbox id={id} checked={selected.has(s)} onCheckedChange={(v) => onToggle(s, v === true)} />
                <label htmlFor={id} className="text-sm">
                  {scopeLabel(s)}
                </label>
              </div>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}

/**
 * A secret shown once (a new token, a rotated one): copying it, and asking
 * before whatever shows it closes uncopied, since it can't be shown again.
 * `again` says what it would take to get one: "You'd have to make a new one."
 * mayClose(onDone) is true when it may close now; otherwise it asks, and
 * calls onDone if the answer is to close anyway.
 */
export function useOneTimeSecret(again: string, initial: string | null = null) {
  const confirm = useConfirm()
  const [secret, setSecret] = useState<string | null>(initial)
  const { state, copy } = useCopy()
  const [everCopied, setEverCopied] = useState(false)
  // Only a copy the clipboard took counts: after a refused one, closing still asks.
  const copySecret = async () => {
    if (secret && (await copy(secret))) setEverCopied(true)
  }
  const mayClose = (onDone: () => void) => {
    if (!secret || everCopied) return true
    confirm({
      title: "Close without copying?",
      description: `The token can't be shown again. ${again}`,
      confirmText: "Close without copying",
      cancelText: "Go back",
      destructive: true,
      onConfirm: onDone,
    })
    return false
  }
  return {
    secret,
    setSecret,
    copySecret,
    copied: state === "copied" || (everCopied && state !== "failed"),
    copyFailed: state === "failed",
    mayClose,
  }
}
