"use client"

import type { SyntheticEvent } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PrincipalTag } from "@/components/ui/principalTag"
import { RelayedAvatar } from "@/components/message/relayedAvatar"
import { splitRelayedName, type RelayKind } from "@/lib/relayedAuthor"

// The card is portalled, but React still bubbles its events to the row it
// came from: pressing the name or the card must not also open the thread.
const keepToTheCard = (e: SyntheticEvent) => e.stopPropagation()

/**
 * The name of someone who writes here without being a member (a guest, or
 * a person in a linked Slack channel), and the small card it opens: who
 * they are, where they are from, and how their words arrive (F-42). Read
 * only: there is no profile to open, nor anyone to message. A member's name
 * opens their profile; a guest's opened nothing. Every name line uses it:
 * the list and the thread, on a computer and on a phone.
 */
export function RelayedPersonCard({ name, kind }: { name: string; kind: RelayKind }) {
  const { person, org } = splitRelayedName(name)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={keepToTheCard}
          className="truncate rounded-[4px] text-ui font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={person}
        className="w-64 p-3"
        data-relayed-card=""
        onClick={keepToTheCard}
      >
        <div className="flex items-center gap-2.5">
          <span className="size-9 shrink-0">
            <RelayedAvatar name={name} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-ui font-semibold text-ink">{person}</p>
            <PrincipalTag kind={kind} />
          </div>
        </div>
        <p className="mt-2.5 text-ui-sm text-ink-2">
          {kind === "guest"
            ? `${org ? `From ${org}. ` : ""}Writes here through a guest link, and isn't a member of this workspace.`
            : "Writes in Slack. Their messages reach this channel through the Slack bridge."}
        </p>
      </PopoverContent>
    </Popover>
  )
}
