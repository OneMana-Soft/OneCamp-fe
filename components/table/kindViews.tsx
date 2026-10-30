"use client"

// What Tables B1's people and ratings look like at rest (STEP5 spec E), for
// a member's grid (kindCells) and a guest's read-only table alike: people as
// up to three 20px faces, one with their first name, "+N" past three; a
// rating as its stars. No pickers here, so a guest's page brings none.

import { Star } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { Faces } from "@/components/ui/graphics/Faces"
import { hiddenText } from "@/lib/tables/cellFormat"
import { isHiddenRef, type RelationRef } from "@/services/tableService"

/** A person's 20px face: their hue's disc and initials, keyed by their name as every avatar is. */
export function Face({ name, className }: { name: string; className?: string }) {
  return <IdentityMark id={avatarSeed(name)} label={name} variant="avatar" size={20} className={cn("shrink-0", className)} />
}

/** People as a cell shows them; those the reader can't see as one quiet phrase. */
export function PeopleFaces({ refs, readOnly }: { refs: RelationRef[]; readOnly?: boolean }) {
  const named = refs.filter((r) => r.type !== "more" && !isHiddenRef(r) && r.label)
  const hidden = refs.filter((r) => r.type !== "more" && (isHiddenRef(r) || !r.label)).length
  const shown = named.slice(0, 3)
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={named.map((r) => r.label).join(", ") || undefined} data-people-faces="">
      {/* The faces a share dialog draws (components/ui/graphics/Faces). */}
      <span className="shrink-0">
        <Faces people={shown.map((r) => ({ user_uuid: r.id, name: r.label as string }))} />
      </span>
      {named.length === 1 ? <span className={cn("truncate text-ui", readOnly ? "text-ink-2" : "text-ink")}>{(named[0].label as string).split(/\s+/)[0]}</span> : null}
      {named.length > 3 ? <span className="shrink-0 text-meta text-ink-3">+{named.length - 3}</span> : null}
      {hidden > 0 ? <span className="truncate text-meta text-ink-3">{hiddenText(hidden)}</span> : null}
    </span>
  )
}

/** One 14px star: the sun hue lit, ink-3 lit where it can't be changed, line-2 unlit. */
export function RatingStar({ on, locked }: { on: boolean; locked?: boolean }) {
  return (
    <Star
      aria-hidden="true"
      className={cn("size-3.5 transition-colors duration-[120ms]", !on ? "fill-line-2 text-line-2" : locked ? "fill-ink-3 text-ink-3" : cn(HUE_CLASS.sun, "fill-hue text-hue"))}
    />
  )
}

/** A rating that can't be changed: its stars, named as "4 of 5". */
export function Stars({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <span role="img" aria-label={`${label}: ${value ? `${value} of ${max}` : "not rated"}`} className="inline-flex items-center gap-0.5">
      {value ? Array.from({ length: max }, (_, i) => <RatingStar key={i} on={i < value} locked />) : null}
    </span>
  )
}
