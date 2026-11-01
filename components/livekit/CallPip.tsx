"use client"

// The call in a small window of its own (meet-14), as Meet's
// picture-in-picture: over other tabs and apps while the call's tab is out of
// sight. One picture, the one you'd look for (lib/calls/callPip's pipOrder),
// and the controls you reach for then: microphone, camera, back to the call,
// and leave. It's drawn into the window through a portal, so it keeps the
// room's context and works the dock's own switches.

import * as React from "react"
import { createPortal } from "react-dom"
import { useRoomContext, useSpeakingParticipants, useTracks } from "@livekit/components-react"
import { Track } from "livekit-client"
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { lastSpeaker, pipOrder } from "@/lib/calls/callPip"
import { TRANSCRIBER_IDENTITY } from "@/lib/calls/signals"
import type { CallHold } from "@/lib/calls/holds"
import { heldReason } from "./callHolds"
import { CALL_SURFACE } from "./callSurface"
import { CONTROL_LABELS, DOCK_BUTTON, DOCK_STATE_CLASS, type DockState } from "./DockButton"
import { StageTile } from "./StageTile"
import { PipGlyph } from "./pipGlyph"

export interface CallPipProps {
  /** The window to draw into (usePipWindow's). */
  win: Window
  micOn: boolean
  cameraOn: boolean
  /** What the people running the call hold for you (meet-12): those controls stay, dimmed, and say why. */
  held?: ReadonlySet<CallHold>
  onToggleMic: () => void
  onToggleCamera: () => void
  /** Closes the window and brings the call's tab back. */
  onBack: () => void
  onLeave: () => void
}

/** Leave's fill, as the dock's: its one danger colour. */
const LEAVE_FILL = "rounded-[12px] bg-[#D1293D] text-white hover:bg-[color-mix(in_oklab,#D1293D_92%,black)]"

/**
 * A control in the window: the dock's look and state, its name in the
 * browser's own tooltip (the dock's tooltips draw in the call's tab, which is
 * out of sight). Held, it stays dimmed and says why instead of acting.
 */
function PipButton({ label, state = "on", pressed, hint, icon, className, onClick }: { label: string; state?: DockState; pressed?: boolean; hint?: string; icon: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={hint ? true : undefined}
      title={hint ?? label}
      data-dock-state={state}
      className={cn(DOCK_BUTTON, className ?? DOCK_STATE_CLASS[state])}
      onClick={hint ? undefined : onClick}
    >
      {icon}
    </button>
  )
}

/** The call's window. Draws nothing in the call's own tab. */
export function CallPip({ win, micOn, cameraOn, held, onToggleMic, onToggleCamera, onBack, onLeave }: CallPipProps) {
  const room = useRoomContext()
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((t) => t.participant.identity !== TRANSCRIBER_IDENTITY)
  // Drawn again as people begin and stop speaking: whoever spoke last is the picture.
  useSpeakingParticipants()
  const you = room.localParticipant.identity
  const keyOf = (t: (typeof tracks)[number]) => `${t.participant.identity}|${t.source}`
  const [first] = pipOrder(tracks.map(keyOf), { speaker: lastSpeaker(room.remoteParticipants.values(), you), you })
  const focus = tracks.find((t) => keyOf(t) === first)
  const micHeld = !micOn && held?.has("microphone")
  const cameraHeld = !cameraOn && held?.has("camera")

  return createPortal(
    <div data-call-pip="" className={cn(CALL_SURFACE, "flex h-dvh flex-col gap-2 bg-[#0B0C0E] p-2 text-[#EEEEF0]")}>
      <div className="min-h-0 flex-1">
        {/* A strip tile's picture: its plate names the person, and a face draws no name of its own (DESIGN-BUILD-57). */}
        {focus ? <StageTile key={first} trackRef={focus} size="sm" contain={focus.source === Track.Source.ScreenShare} /> : null}
      </div>
      <div role="toolbar" aria-label="Call controls" className="flex shrink-0 items-center justify-center gap-2">
        <PipButton
          label={micOn ? CONTROL_LABELS.mute : CONTROL_LABELS.unmute}
          state={micOn ? "on" : "off"}
          pressed={micOn}
          hint={micHeld ? heldReason("microphone") : undefined}
          icon={micOn ? <Mic /> : <MicOff />}
          onClick={onToggleMic}
        />
        <PipButton
          label={cameraOn ? CONTROL_LABELS.cameraOff : CONTROL_LABELS.cameraOn}
          state={cameraOn ? "on" : "off"}
          pressed={cameraOn}
          hint={cameraHeld ? heldReason("camera") : undefined}
          icon={cameraOn ? <Video /> : <VideoOff />}
          onClick={onToggleCamera}
        />
        <PipButton label="Back to the call" icon={<PipGlyph />} onClick={onBack} />
        <PipButton label="Leave call" icon={<PhoneOff />} className={LEAVE_FILL} onClick={onLeave} />
      </div>
    </div>,
    win.document.body,
  )
}
