"use client"

// The picker with what it needs from this device: whether backgrounds can run
// in this browser (its surface's control asks the camera's processor), the
// backdrops' pictures, and one's own picture. Used by the call's Effects panel
// and the green room's, through one lazy entry they share (chooserPart.tsx).
// `foot`, the host's pinned foot (effectsFoot.tsx), holds nothing here.

import * as React from "react"
import { backdropUrl } from "@/lib/calls/processors/backdrops"
import { forgetPicture, keepPicture, readPicture } from "@/lib/calls/processors/picture"
import { callToast } from "@/components/livekit/callSurface"
import type { EffectsFoot } from "./effectsFoot"
import type { PickerControls } from "./pickerControls"
import type { CallEffectsControl } from "./useCallEffects"
import { EffectsPicker } from "./EffectsPicker"


/** What the picker says while the CPU watch has made the effects lighter. */
export const LIGHTER_NOTE = "Lighter for now: this device is busy."

/** What a surface hands the chooser (chooserPart.tsx's Part takes the same): `controls`, the picker's shared controls (pickerControls.ts). */
export type ChooserProps = { control: CallEffectsControl; controls: PickerControls; problem?: string | null; columns?: 3 | 4; foot?: EffectsFoot }

export default function EffectsChooser({ control, controls, problem, columns }: ChooserProps) {
  const [unavailable, setUnavailable] = React.useState<string | null>(null)
  const [picture, setPicture] = React.useState<string | null>(() => readPicture())
  const [note, setNote] = React.useState<string | null>(null)
  const { unavailable: ask } = control
  React.useEffect(() => {
    let live = true
    void ask()
      .catch(() => "Background effects couldn't load. Check your connection, then try again.")
      .then((why) => live && setUnavailable(why))
    return () => {
      live = false
    }
  }, [ask])
  const choose = async (file: File) => {
    try {
      const { url, remembered } = await keepPicture(file)
      setPicture(url)
      setNote(remembered ? null : "This browser won't keep your picture, so it lasts until you close the page.")
      control.setBackground({ kind: "picture", at: Date.now() })
    } catch (e) {
      callToast({ title: "That picture can't be used", description: (e as Error).message, variant: "destructive" })
    }
  }
  return (
    <div className="contents">
      {problem ? (
        <p role="alert" className="mb-3 rounded-[10px] bg-[#2E1215] px-3 py-2 text-meta text-[#FFB4B8]" data-effects-problem="">
          {problem}
        </p>
      ) : null}
      <EffectsPicker
        controls={controls}
        effects={control.effects}
        onBackground={control.setBackground}
        onNoise={control.setNoise}
        onTouchUp={control.setTouchUp}
        onLowLight={control.setLowLight}
        busy={control.busy}
        columns={columns}
        note={control.lightened ? LIGHTER_NOTE : null}
        unavailable={unavailable}
        backdrop={backdropUrl}
        picture={{
          url: picture,
          note,
          onChoose: (f) => void choose(f),
          onForget: () => {
            forgetPicture()
            setPicture(null)
            setNote(null)
            if (control.effects.background.kind === "picture") control.setBackground({ kind: "none" })
          },
        }}
      />
    </div>
  )
}
