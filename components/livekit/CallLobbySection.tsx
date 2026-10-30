"use client"

/**
 * Who is waiting to join, at the top of the People panel, for whoever may let
 * them in (CALLS-2): each name with how long they've waited, Admit and Deny
 * beside it, and Admit all when more than one waits. The server keeps the
 * list and decides (business/CallLobby); a row stays until the server's next
 * word, its buttons resting while a decision is on its way. Part of the
 * People panel's chunk, so none of a call's first load.
 */

import * as React from "react"
import { useNow } from "@/hooks/useNow"
import { type Knock, waitedFor } from "@/lib/calls/lobby"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { LOBBY_GHOST, LOBBY_PRIMARY, LOBBY_SECONDARY } from "./lobbyButtons"



export function CallLobbySection({
  waiting,
  onDecide,
  onAdmitAll,
}: {
  waiting: readonly Knock[]
  onDecide: (ticket: string, name: string, admit: boolean) => Promise<unknown> | void
  onAdmitAll: () => Promise<unknown> | void
}) {
  const headingId = React.useId()
  // A clock for the waited times, ticking each 30 s while anyone waits.
  const now = useNow(waiting.length > 0, 30_000)
  // Tickets with a decision on its way; one gone from the list is forgotten.
  const [pending, setPending] = React.useState<ReadonlySet<string>>(() => new Set())
  const [allPending, setAllPending] = React.useState(false)
  const tickets = waiting.map((k) => k.ticket).join(",")
  React.useEffect(() => {
    const here = new Set(tickets.split(","))
    setPending((p) => (Array.from(p).every((t) => here.has(t)) ? p : new Set(Array.from(p).filter((t) => here.has(t)))))
    setAllPending(false)
  }, [tickets])

  if (waiting.length === 0) return null

  const decide = (k: Knock, admit: boolean) => {
    setPending((p) => new Set(p).add(k.ticket))
    // A refusal is said by the action's own notice; the row comes back to life.
    void Promise.resolve(onDecide(k.ticket, k.name, admit)).finally(() =>
      setPending((p) => {
        const n = new Set(p)
        n.delete(k.ticket)
        return n
      }),
    )
  }
  const admitAll = () => {
    setAllPending(true)
    void Promise.resolve(onAdmitAll()).finally(() => setAllPending(false))
  }

  return (
    <section aria-labelledby={headingId} data-call-lobby="" className="shrink-0 border-b border-white/[0.06] px-3 pt-2 pb-2.5">
      <div className="mb-1 flex min-h-8 items-center justify-between gap-2">
        <h3 id={headingId} className="flex items-baseline gap-2 text-micro text-ink-3">
          Waiting to join
          <span className="tabular-nums">{waiting.length}</span>
        </h3>
        {waiting.length > 1 ? (
          <button type="button" className={LOBBY_PRIMARY} onClick={admitAll} disabled={allPending} data-lobby-admit-all="">
            Admit all
          </button>
        ) : null}
      </div>
      <ul className="max-h-[40vh] space-y-0.5 overflow-y-auto">
        {waiting.map((k) => {
          const busy = allPending || pending.has(k.ticket)
          const waited = waitedFor(k.knocked_at, now)
          return (
            <li key={k.ticket} className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-1 py-1.5" data-lobby-row="">
              <IdentityMark variant="avatar" size={28} id={avatarSeed(k.name)} label={k.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui-sm font-medium text-[#EEEEF0]">{k.name}</span>
                {waited ? <span className="text-meta text-ink-3">{waited === "Just now" ? "Knocked just now" : `Waiting ${waited}`}</span> : null}
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button type="button" className={LOBBY_GHOST} disabled={busy} aria-label={`Deny ${k.name}`} onClick={() => decide(k, false)}>
                  Deny
                </button>
                {/* The one orange action: Admit all when others wait too, else this Admit. */}
                <button type="button" className={waiting.length > 1 ? LOBBY_SECONDARY : LOBBY_PRIMARY} disabled={busy} aria-label={`Admit ${k.name}`} onClick={() => decide(k, true)}>
                  Admit
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
