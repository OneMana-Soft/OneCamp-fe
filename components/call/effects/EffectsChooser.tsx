"use client"

// The picker with what it needs from this device: whether backgrounds can run
// in this browser, the backdrops' pictures, and one's own picture. Used by
// the call's Effects panel and the green room's, and loaded with them.

import * as React from "react"
import { backdropUrl } from "@/lib/calls/processors/backdrops"
import { forgetPicture, keepPicture, readPicture } from "@/lib/calls/processors/picture"
import { callToast } from "@/components/livekit/callSurface"
import type { CallEffectsControl } from "./useCallEffects"
import { EffectsPicker } from "./EffectsPicker"

/** What the picker says while the CPU watch has made the effects lighter. */
export const LIGHTER_NOTE = "Lighter for now: this device is busy."

export default function EffectsChooser({ control, problem, columns }: { control: CallEffectsControl; problem?: string | null; columns?: 3 | 4 }) {
  const [unavailable, setUnavailable] = React.useState<string | null>(null)
  const [picture, setPicture] = React.useState<string | null>(() => readPicture())
  const [note, setNote] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    void import("@/lib/calls/processors/background")
      .then((m) => m.backgroundUnavailable())
      .catch(() => "Background effects couldn't load. Check your connection, then try again.")
      .then((why) => live && setUnavailable(why))
    return () => {
      live = false
    }
  }, [])
  const choose = async (file: File) => {
    try {
      const { url, remembered } = await keepPicture(file)
      setPicture(url)
      setNote(remembered ? null : "This browser won't keep your picture, so it lasts until you close the page.")
      control.setBackground({ kind: "picture" })
    } catch (e) {
      callToast({ title: "That picture can't be used", description: (e as Error).message, variant: "destructive" })
    }
  }
  return (
    <>
      {problem ? (
        <p role="alert" className="mb-3 rounded-[10px] bg-[#2E1215] px-3 py-2 text-meta text-[#FFB4B8]" data-effects-problem="">
          {problem}
        </p>
      ) : null}
      <EffectsPicker
        effects={control.effects}
        onBackground={control.setBackground}
        onNoise={control.setNoise}
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
    </>
  )
}
