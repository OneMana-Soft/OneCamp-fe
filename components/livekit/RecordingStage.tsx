"use client"

// The call's stage as its recording draws it (H3, meet-17): LiveKit's egress
// opens /call-recording-layout in its own Chrome and records the page from the
// moment it says START_RECORDING, until it says END_RECORDING.
//
// - The way in is the recorder's ticket in the address's fragment
//   (lib/calls/recorderTicket), read once; the address is then the bare path.
//   Without one the page draws nothing, connects nowhere and never says
//   START_RECORDING, and egress records again on LiveKit's own grid.
// - It joins as the egress recorder (hidden, subscribe-only): it publishes
//   nothing, and draws everyone but itself.
// - The stage is the call's: the same builder (roomStageLayout) as the call
//   with no pin, the first page and the mode the call takes by itself
//   (recordingView), drawn by the call's own grid, focus and strip, and its
//   own tile (TileBody) without the tile's controls.
// - One theme: the call's own dark stage (CALL_SURFACE), whatever the
//   recording Chrome's colour scheme, as everyone on the call sees it.
// - The call's gutter (STAGE_INSET) on every side: no pills, no dock.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { RoomAudioRenderer, RoomContext, useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react"
import { Room, RoomEvent, Track } from "livekit-client"
import { useHostPill } from "@/components/error/pillPlace"
import { presentationOrder, recordingView, roomStageLayout, stageKey, type RoomStage, type StageKey } from "@/lib/calls/stageLayout"
import { readRecorderTicket, type RecorderTicket } from "@/lib/calls/recorderTicket"
import { TRANSCRIBER_IDENTITY } from "@/lib/calls/signals"
import { cn } from "@/lib/utils/helpers/cn"
import { StageFocus, StageGrid, StageMore, useContentBox } from "./StageGrid"
import { TileBody, type TileSize } from "./TileBody"
import { CALL_SURFACE, STAGE_INSET } from "./callSurface"
import { useCallMetadata, useStageSpeaker } from "./stageTracks"

/** Where the page is: no ticket (idle), joining, refused or cut off before it drew (failed), drawing (live), or the call gone (ended). */
type Phase = "idle" | "connecting" | "failed" | "live" | "ended"

/** What egress waits for before it records, and what stops it (LiveKit's template protocol). */
const START = "START_RECORDING"
const END = "END_RECORDING"
/** Egress reads the page's console. */
const say = (word: string) => console.log(word)

const trackKey = (t: TrackReferenceOrPlaceholder) => stageKey(t.participant.identity, t.source)
const nothing = () => {}

export function RecordingStage() {
  const [phase, setPhase] = useState<Phase>("idle")
  const [room, setRoom] = useState<Room | null>(null)
  const ticket = useRef<RecorderTicket | null | undefined>(undefined)
  const said = useRef({ start: false, end: false })
  // The connection pill (OfflineNotice) stands down, as under a shell that draws it: a recording shows no chrome.
  useHostPill()

  useEffect(() => {
    // Read once, then the address is the bare path: the token is in no history entry and no copy of the address.
    if (ticket.current === undefined) {
      ticket.current = readRecorderTicket(window.location.hash)
      if (window.location.hash || window.location.search) window.history.replaceState(null, "", window.location.pathname)
    }
    const way = ticket.current
    if (!way) return
    const joining = new Room({ adaptiveStream: true })
    let on = true
    setPhase("connecting")
    joining.on(RoomEvent.Disconnected, () => {
      if (on) setPhase((p) => (p === "live" ? "ended" : "failed"))
    })
    joining.connect(way.url, way.token, { autoSubscribe: true }).then(
      () => {
        if (!on) return
        setRoom(joining)
        setPhase("live")
      },
      () => {
        if (on) setPhase("failed")
      },
    )
    return () => {
      on = false
      void joining.disconnect()
    }
  }, [])

  // START once the stage has drawn its first frame; END once, when the call is gone, so egress stops.
  const drawn = useCallback(() => {
    if (said.current.start) return
    said.current.start = true
    say(START)
  }, [])
  useEffect(() => {
    if (phase !== "ended" || !said.current.start || said.current.end) return
    said.current.end = true
    say(END)
  }, [phase])

  return (
    <div data-recording-stage={phase} className={cn(CALL_SURFACE, "fixed inset-0 overflow-hidden bg-[#0B0C0E] text-[#EEEEF0]")}>
      {room && phase !== "failed" ? (
        <RoomContext.Provider value={room}>
          <RoomAudioRenderer />
          <LiveStage room={room} onDrawn={drawn} />
        </RoomContext.Provider>
      ) : null}
    </div>
  )
}

/** The stage, measured, as the call draws it for someone who pinned nothing. */
function LiveStage({ room, onDrawn }: { room: Room; onDrawn: () => void }) {
  // Everyone in the room but the recorder itself (and the captions' transcriber, as on the call).
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((t) => !t.participant.isLocal && t.participant.identity !== TRANSCRIBER_IDENTITY)
  const meta = useCallMetadata(room)
  const speaker = useStageSpeaker(tracks)

  // What is presented, in the order it began (presentationOrder). A board on the stage isn't: its canvas reads
  // OneCamp's API with a member's or a guest's session, and this page has neither, so the recording draws the
  // people's grid while a board is up (or the share or the spotlight, as the call would beside it).
  const sharing = tracks.filter((t) => t.source === Track.Source.ScreenShare).map(trackKey)
  const [presented, setPresented] = useState<StageKey[]>([])
  const presenting = presentationOrder(presented, sharing)
  useLayoutEffect(() => {
    if (presenting.order !== presented) setPresented(presenting.order)
  }, [presenting.order, presented])

  const frame = useRef<HTMLDivElement>(null)
  const box = useContentBox(frame)
  const measured = box.w > 0 && box.h > 0
  const roomStage: RoomStage = {
    cameras: tracks.filter((t) => t.source === Track.Source.Camera).map(trackKey),
    presenting: presenting.order,
    board: null,
    spotlight: meta.spotlight?.identity ?? null,
    speaker: speaker ? trackKey(speaker) : null,
  }
  const stage = roomStageLayout(roomStage, recordingView(roomStage, box))
  useEffect(() => {
    if (measured) onDrawn()
  }, [measured, onDrawn])

  const byKey = new Map(tracks.map((t) => [trackKey(t), t]))
  // Each place's tile as the call draws it there: the focus's large, its picture fitted; the strip's small, the plate naming them.
  const tile = (key: StageKey, place: { size?: TileSize; contain?: boolean } = {}) => {
    const t = byKey.get(key)
    return t ? <TileBody trackRef={t} {...place} /> : null
  }
  return (
    // Past 49 people the recording draws the grid's first page, as the call opens on it, and no pager.
    <div ref={frame} className={cn("h-full w-full [&_[data-stage-pager]]:hidden", STAGE_INSET)} data-stage-layout={stage.grid ? "grid" : "focus"}>
      {!measured ? null : stage.grid ? (
        <StageGrid grid={stage.grid} cell={(key) => tile(key)} onPage={nothing} />
      ) : (
        <StageFocus
          stage={stage}
          cell={(key) => tile(key, { size: "lg", contain: true })}
          place={(key, style) => (
            <div className="relative shrink-0" style={style}>
              {tile(key, { size: "sm" })}
            </div>
          )}
          more={(style) => <StageMore more={stage.strip.more} style={style} onShow={nothing} />}
        />
      )}
    </div>
  )
}
