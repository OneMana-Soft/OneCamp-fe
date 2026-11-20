"use client"

// A call's backgrounds and sound, as one lazy piece (VideoConference loads it
// beside the stage): it puts the effects chosen on this device on the camera
// and microphone as they publish (useCallEffects), and draws the panel while
// it is open. Nothing of it is in a call's first load. The panel's chooser is
// one chunk that the green room's shares (chooserPart.tsx), asked for as this
// mounts, so it is in when the panel opens.

import { useEffect } from "react"
import { CALL_PANEL_COVER } from "@/components/livekit/callPanelClasses"
import CallEffectsPanel from "./CallEffectsPanel"
import { chooser } from "./chooserPart"
import { useCallEffects } from "./useCallEffects"
import type { Room } from "livekit-client"

/** `made`: a scene may be made from words here (a member, the workspace's AI on: VideoConference). */
export default function CallEffects({ room, open, onClose, made = false }: { room: Room; open: boolean; onClose: () => void; made?: boolean }) {
  const control = useCallEffects(room)
  useEffect(() => void chooser.warm(made), [made])
  if (!open) return null
  // Like the chat, it covers the dock on a phone: its pinned foot is the screen's footer.
  return (
    <div className={CALL_PANEL_COVER}>
      <CallEffectsPanel control={control} onClose={onClose} made={made} />
    </div>
  )
}
