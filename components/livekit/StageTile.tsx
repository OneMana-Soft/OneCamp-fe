"use client"

/**
 * One participant on the stage (hub.md C5, C6): the tile's body (TileBody: the
 * picture or their face, the ring, the plate) with the call's controls on it,
 * a hover's tint, a raised hand, Call Control's menu and the pin. Built on
 * LiveKit's ParticipantTile for its contexts and click handling, with our own
 * contents in place of LiveKit's defaults.
 */
import { type ReactNode } from "react"
import { ParticipantTile, useEnsureTrackRef, type ParticipantClickEvent, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import type { Participant } from "livekit-client"
import { Pin, PinOff } from "@/lib/icons"
import type { PersonAction } from "@/lib/calls/control"
import { cn } from "@/lib/utils/helpers/cn"
import dynamic from "next/dynamic"
import { useHandPlace } from "./handsQueue"

// A raised hand's badge: drawn once someone raises one, so not with the call.
const HandBadge = dynamic(() => import("./HandBadge").then((m) => m.HandBadge), { ssr: false })
import { PersonActionsMenu } from "./callHosting"
import { TileBody, type TileSize } from "./TileBody"

export function StageTile({
  trackRef: given,
  onParticipantClick,
  pinned,
  onPin,
  size = "md",
  contain = false,
  actionsFor,
  onAction,
  layer,
  className,
}: {
  trackRef?: TrackReferenceOrPlaceholder
  onParticipantClick?: (evt: ParticipantClickEvent) => void
  pinned?: boolean
  onPin?: () => void
  size?: TileSize
  /** A shared screen fits the frame rather than filling it. */
  contain?: boolean
  /**
   * What whoever runs the call may do to this person (Call Control): a menu
   * on the tile, never on your own, an agent's or a shared screen.
   */
  actionsFor?: (participant: Participant) => PersonAction[]
  onAction?: (action: PersonAction, participant: Participant) => void
  /** What is drawn over the picture, under the plate and the tile's controls: a shared screen's ink (callInk). */
  layer?: ReactNode
  className?: string
}) {
  const trackRef = useEnsureTrackRef(given)
  const handPlace = useHandPlace(trackRef.participant.identity)

  return (
    <TileBody
      trackRef={trackRef}
      size={size}
      contain={contain}
      className={cn(
        "group/tile focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand",
        // LiveKit's focus toggle, which ParticipantTile draws in every tile and shows on a hover or a tap: our pin is the
        // one control in that corner, and the toggle never takes a Tab (DESIGN-BUILD-55). Important, as LiveKit's CSS is unlayered.
        "[&_.lk-focus-toggle-button]:!hidden",
        className,
      )}
      picture={(video) => (
        <ParticipantTile trackRef={trackRef} onParticipantClick={onParticipantClick} className="!h-full !w-full !rounded-none !bg-transparent">
          {/* Always contents of ours, if only an empty one: given none, LiveKit draws its own silhouette, mic and name in the tile (DESIGN-BUILD-55). */}
          {video ?? <></>}
        </ParticipantTile>
      )}
      under={
        <>
          {/* A 4% white overlay on hover. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-white/0 transition-colors group-hover/tile:bg-white/[0.04]" />
          {layer}
        </>
      }
      controls={({ who, name, agent, screen }) => {
        const actions = actionsFor && !who.isLocal && !agent && !screen ? actionsFor(who) : []
        return (
          <>
            {handPlace !== null && !screen ? <HandBadge place={handPlace} className="absolute left-2 top-2 z-[3]" /> : null}
            {actions.length > 0 ? (
              // Beside the pin where there is one. Its own button, so pressing it
              // never also brings the tile to the stage.
              <span className={cn("absolute top-2 z-[3]", onPin ? "right-10" : "right-2")} onClick={(e) => e.stopPropagation()} data-tile-menu="">
                <PersonActionsMenu
                  name={name}
                  actions={actions}
                  onSelect={(a) => onAction?.(a, who)}
                  triggerClassName="grid size-7 place-items-center rounded-[8px] bg-[rgb(11_12_14/0.72)] text-[#EEEEF0] opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand group-hover/tile:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 [&_svg]:size-3.5"
                />
              </span>
            ) : null}
            {onPin ? (
              <button
                type="button"
                aria-label={pinned ? "Unpin" : "Pin to the stage"}
                aria-pressed={!!pinned}
                onClick={(e) => {
                  e.stopPropagation()
                  onPin()
                }}
                className={cn(
                  "absolute right-2 top-2 z-[3] grid size-7 place-items-center rounded-[8px] bg-[rgb(11_12_14/0.72)] text-[#EEEEF0] transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-3.5",
                  pinned ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100",
                  // While you draw on this tile's share, the pin steps aside for the drawing bar, which a phone's narrow tile
                  // gives its whole width (callInk's data-ink-drawing; DESIGN-BUILD-57 MUST 1).
                  // A targeted rule, never group-has-: Tailwind compiles that to `:has(..) *`, and Chrome then restyles a whole
                  // subtree on every DOM change under any :has() anchor in the app (V-924; lib/ui/styleInvalidationGuard.test.ts).
                  "[:where([data-stage-tile]):has([data-ink-drawing])_&]:hidden",
                )}
              >
                {pinned ? <PinOff /> : <Pin />}
              </button>
            ) : null}
          </>
        )
      }}
    />
  )
}
