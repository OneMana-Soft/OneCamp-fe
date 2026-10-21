"use client"

// A call's backgrounds and sound, as one lazy piece (VideoConference loads it
// beside the stage): it puts the effects chosen on this device on the camera
// and microphone as they publish (useCallEffects), and draws the panel while
// it is open. Nothing of it is in a call's first load.

import CallEffectsPanel from "./CallEffectsPanel"
import { useCallEffects } from "./useCallEffects"
import type { Room } from "livekit-client"

export default function CallEffects({ room, open, onClose }: { room: Room; open: boolean; onClose: () => void }) {
  const control = useCallEffects(room)
  if (!open) return null
  return (
    <div className="absolute inset-0 z-30 @3xl:static @3xl:inset-auto @3xl:z-auto @3xl:h-full shrink-0">
      <CallEffectsPanel control={control} onClose={onClose} />
    </div>
  )
}
