"use client"

/**
 * The profile card (design v3, hub.md P1): a glance, not a modal. A 72px
 * banner in the person's own gradient carries the ring motif (the card's one
 * colour moment), the 64px avatar overlaps it with the presence dot, and
 * under it the name, handle, tags, job title, status, local time and the
 * actions. An agent is the agent gradient and square with its governance
 * line; a bot is neutral with no Message; your own card offers Edit profile
 * and Set a status.
 *
 * This file draws; components/dialog/otherUserProfileDialog.tsx fetches and
 * places it (an anchored popover, a bottom sheet on a phone).
 */
import * as React from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { avatarHueClass } from "@/components/ui/graphics/hues"
import { PresenceDot, type Presence } from "@/components/ui/presenceDot"
import { Skeleton } from "@/components/ui/skeleton"
import { Bot, Clock } from "@/lib/icons"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { getNameInitials } from "@/lib/utils/getNameInitials"

export type ProfileKind = "person" | "agent" | "bot" | "self"

export interface ProfileCardProps {
  kind: ProfileKind
  /** A stable key for the person's hue (their uuid). */
  hueId: string
  name: string
  handle?: string
  /** A second line under the name, when there is no handle: an address, or a bot's job. */
  subtitle?: string
  photo?: string
  presence?: Presence
  /** Tags beside the name: Admin, External, Agent, Bot. */
  tags?: React.ReactNode
  /** A pill on the right of the name row (an agent's Active or Paused). */
  state?: React.ReactNode
  jobTitle?: string
  status?: { emoji?: string; text: string; until?: string }
  localTime?: string
  /** What sits under the lines: an agent's governance rows, an external contact's note. */
  body?: React.ReactNode
  actions?: React.ReactNode
  loading?: boolean
  onPhoto?: () => void
  /** A phone's bottom sheet: a 96px banner and an 80px avatar. */
  sheet?: boolean
}

/** The banner's ring motif: two arcs from the right edge, in white at 14%. */
function Rings({ spark, tone = "white" }: { spark?: boolean; tone?: "white" | "line" }) {
  const stroke = tone === "white" ? "#fff" : "var(--line-2)"
  return (
    <svg aria-hidden width="200" height="200" viewBox="0 0 200 200" fill="none" className="absolute -right-10 -top-[50px]" stroke={stroke} strokeOpacity={tone === "white" ? 0.14 : 1} strokeWidth="1.5">
      <circle cx="100" cy="100" r="60" />
      <circle cx="100" cy="100" r="90" />
      {spark ? (
        <path
          transform="translate(30 120) scale(1.2)"
          d="M12 2.5c.5 4.6 2.9 7 9.5 9.5-6.6 2.5-9 4.9-9.5 9.5-.5-4.6-2.9-7-9.5-9.5 6.6-2.5 9-4.9 9.5-9.5z"
          fill="#fff"
          fillOpacity=".16"
          stroke="none"
        />
      ) : null}
    </svg>
  )
}

export function ProfileCard(p: ProfileCardProps) {
  const hue = hueFor(p.hueId)
  const agent = p.kind === "agent"
  const bot = p.kind === "bot"
  const avatarPx = p.sheet ? 80 : 64
  const bannerClass = agent ? "avatar-agent rounded-none" : bot ? "bg-sunken" : cn(avatarHueClass(hue), "shadow-none")

  return (
    <div data-profile-card={p.kind} className="overflow-hidden">
      <div data-profile-banner="" data-hue={agent || bot ? undefined : hue} className={cn("relative overflow-hidden", p.sheet ? "h-24" : "h-[72px]", bannerClass)}>
        <Rings spark={agent} tone={bot ? "line" : "white"} />
      </div>

      <div className="relative -mt-7 ml-4 w-max">
        <button
          type="button"
          disabled={!p.onPhoto}
          onClick={p.onPhoto}
          aria-label={`See ${p.name}'s photo`}
          className="hub-pop-in relative block rounded-full enabled:cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          style={{ animationDelay: "40ms", width: avatarPx, height: avatarPx }}
        >
          <span data-profile-avatar="" className={cn("hub-avatar-ring block h-full w-full", agent || bot ? "rounded-[32%]" : "rounded-full")}>
            {agent ? (
              <AgentAvatar src={p.photo} />
            ) : bot ? (
              <BotAvatar src={p.photo}>
                <Bot />
              </BotAvatar>
            ) : (
              <Avatar className="h-full w-full">
                {p.photo ? <AvatarImage src={p.photo} alt="" /> : null}
                <AvatarFallback className={cn(avatarHueClass(hue))} style={{ fontSize: Math.round(avatarPx * 0.375) }}>
                  {getNameInitials(p.name)}
                </AvatarFallback>
              </Avatar>
            )}
          </span>
          {p.presence && !agent && !bot ? <PresenceDot presence={p.presence} ring="var(--pop)" className="!size-5 !min-h-5 !min-w-5" /> : null}
        </button>
      </div>

      <div className="px-4 pb-4 pt-2">
        {p.loading && !p.name ? (
          <div className="space-y-2" role="status" aria-label="Loading their profile">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 data-profile-name="" className="min-w-0 truncate text-title-3 font-semibold">
                {p.name || "Unnamed"}
              </h2>
              {p.tags}
              {p.state ? <span className="ml-auto shrink-0">{p.state}</span> : null}
            </div>
            {p.handle || p.subtitle ? <p className="truncate text-ui-sm text-ink-3">{p.handle ? `@${p.handle}` : p.subtitle}</p> : null}
            {p.jobTitle ? <p className="mt-1 truncate text-ui text-ink-2">{p.jobTitle}</p> : null}
            {p.loading ? (
              <div className="mt-3 space-y-2" aria-hidden>
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            ) : null}
            {p.status ? (
              <p data-profile-status="" className="mt-2 flex min-w-0 items-center gap-2 text-ui">
                {p.status.emoji ? <span aria-hidden className="text-ui">{p.status.emoji}</span> : null}
                <span className="truncate">{p.status.text}</span>
                {p.status.until ? <span className="shrink-0 text-ui-sm text-ink-3">until {p.status.until}</span> : null}
              </p>
            ) : null}
            {p.localTime ? (
              <p className="mt-1.5 flex items-center gap-2 text-ui-sm text-ink-2">
                <Clock className="size-3.5 text-ink-3" /> {p.localTime}
              </p>
            ) : null}
            {p.body ? <div className="mt-3">{p.body}</div> : null}
            {p.actions ? <div data-profile-actions="" className={cn("mt-3.5 flex gap-2", p.sheet && "flex-col [&>*]:h-11 [&>*]:w-full")}>{p.actions}</div> : null}
          </>
        )}
      </div>
    </div>
  )
}

/** An agent's Active or Paused pill. */
export function AgentStatePill({ active }: { active: boolean }) {
  return (
    <span
      data-agent-state={active ? "active" : "paused"}
      className={cn("inline-flex h-[18px] items-center rounded-[5px] px-1.5 text-micro font-medium", active ? "bg-camp-moss-tint text-camp-moss-ink" : "bg-camp-sun-tint text-camp-sun-ink")}
    >
      {active ? "Active" : "Paused"}
    </span>
  )
}

