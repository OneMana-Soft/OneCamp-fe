"use client"

import * as React from "react"

import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { ChatFace } from "@/components/message/chatFace"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { SpotSearch } from "@/components/ui/graphics/spots"
import { loadFailure } from "@/lib/http/loadFailure"
import { EyeOff } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { hrefOf, titleOf } from "@/lib/workGraph/workGraph"
import { countsLine, evidenceHop, isRefused, roleLabel, type WhoKnowsAnswer, type WhoKnowsPerson } from "@/lib/whoKnows/whoKnows"
import { KindTile, rowClass, useRovingRows } from "@/components/workGraph/GraphRow"

/** Where a person changes their own Who knows setting. */
export const WHO_KNOWS_SETTING_HREF = "/app/settings/profile#profile-who-knows"

/**
 * One person who knows: their face, their name and what they did, and (in
 * full) the items that show it, each opening where it lives. The server
 * counted only what the asker can open, so every item here is one they can.
 */
export function WhoKnowsPersonRow({ person, full, onNavigate }: { person: WhoKnowsPerson; full: boolean; onNavigate?: () => void }) {
  const line = countsLine(person)
  const first = person.evidence[0]
  // The strongest item, set apart from the counts (an em space, in ink-2) so it
  // doesn't read as another count.
  const strongest = !full && first ? titleOf(evidenceHop(first)) : ""
  return (
    <div data-who-knows-person={person.id} className="flex flex-col">
      <IntentLink
        href={`/app/user/${encodeURIComponent(person.id)}`}
        onClick={onNavigate}
        aria-label={`${person.name}, ${line}`}
        data-graph-row="person"
        {...ix("row")}
        className={rowClass}
      >
        <ChatFace name={person.name} profileKey={person.avatar_key} userUUID={person.id} size={32} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-ui font-medium text-ink">{person.name}</span>
          {/* The counts are one fact that never breaks; the strongest title wraps to a second line, whole (DESIGN-BUILD-5). */}
          <span className="line-clamp-2 break-words text-meta tabular-nums text-ink-3">
            <span className="whitespace-nowrap">{line}</span>
            {strongest ? <span className="text-ink-2">{"\u2003"}{strongest}</span> : null}
          </span>
        </span>
      </IntentLink>
      {full && person.evidence.length ? (
        <ul aria-label={`What shows ${person.name} knows`} className="ml-[18px] flex flex-col border-l border-line pl-[18px]">
          {person.evidence.map((e) => {
            const hop = evidenceHop(e)
            const href = hrefOf(hop)
            const title = titleOf(hop)
            const verb = roleLabel(e.role, e.kind)
            const inner = (
              <>
                <KindTile kind={hop.kind} size="sm" />
                <span className="line-clamp-2 min-w-0 flex-1 break-words text-meta">
                  <span className="text-ink-3">{verb} </span>
                  <span className="font-medium text-ink-2 group-hover:text-ink">{title}</span>
                </span>
              </>
            )
            return (
              <li key={`${e.kind}:${e.id}`}>
                {href ? (
                  <IntentLink href={href} onClick={onNavigate} aria-label={`${verb} ${title}`} data-graph-row={e.kind} {...ix("row")} className={cn(rowClass, "gap-2 py-1")}>
                    {inner}
                  </IntentLink>
                ) : (
                  <div data-graph-row={e.kind} tabIndex={0} {...ix("row")} className={cn(rowClass, "gap-2 py-1")}>
                    {inner}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/** The asker's own note: they left themselves out, and where to change it. */
export function YouAreHidden({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <p data-who-knows-hidden="" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-meta text-ink-2">
      <EyeOff className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span className="min-w-0 flex-1">{"You're hidden from Who knows, so others don't see you here."}</span>
      <IntentLink href={WHO_KNOWS_SETTING_HREF} onClick={onNavigate} className="shrink-0 font-medium text-ink underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        Change
      </IntentLink>
    </p>
  )
}

/**
 * Who knows about some words, in full: every state says what's true.
 * Loading; a failure with Try again (never "no one" for a read that failed);
 * the server refusing (not a member) or refusing the words, neither of which
 * a retry changes; no one yet; and the people, each with their items.
 */
export function WhoKnowsList({
  words,
  answer,
  error,
  loading,
  onRetry,
  retrying,
  onNavigate,
}: {
  words: string
  answer: WhoKnowsAnswer | undefined
  error: unknown
  loading: boolean
  onRetry(): void
  retrying: boolean
  onNavigate?: () => void
}) {
  const roving = useRovingRows()
  if (error && !answer) {
    if (isRefused(error)) {
      return <EmptyState tone="muted" title="Who knows is for workspace members" description="Sign in with your workspace account to see who knows about something." />
    }
    if (loadFailure(error) === "gone") {
      return <EmptyState tone="muted" title="Try other words" description={apiErrorMessage(error, "Ask about something in 2 to 200 characters.")} />
    }
    return <ErrorState subject="who knows about this" compact retrying={retrying} onRetry={onRetry} />
  }
  if (!answer && loading) {
    return (
      <div role="status" aria-label="Finding who knows" className="pt-1">
        <SkeletonRows rows={4} avatar lines={2} />
      </div>
    )
  }
  if (!answer) return null
  return (
    <div className="flex flex-col gap-3" data-who-knows-list="">
      {answer.you_hidden ? <YouAreHidden onNavigate={onNavigate} /> : null}
      {answer.people.length ? (
        <ul onKeyDown={roving} className="flex flex-col gap-1">
          {answer.people.map((p) => (
            <li key={p.id}>
              <WhoKnowsPersonRow person={p} full onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          tone="muted"
          illustration={<SpotSearch />}
          title="No one yet"
          description={`Nobody has written, been assigned or commented on anything about “${words}” that you can open.`}
        />
      )}
    </div>
  )
}
