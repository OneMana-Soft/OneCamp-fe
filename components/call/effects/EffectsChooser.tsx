"use client"

// The picker with what it needs from this device: whether backgrounds can run
// in this browser (its surface's control asks the camera's processor), the
// backdrops' pictures, one's own picture, and a scene made from words
// (`Composer`: madePart.tsx, for a member whose workspace's AI is on). Used by
// the call's Effects panel and the green room's, through one lazy entry they
// share (chooserPart.tsx). `foot` is the host's pinned foot for the composer's
// actions (effectsFoot.tsx). A scene put on takes the focus and the view to
// its tile; the composer closed with focus in it hands focus to Make one.

import * as React from "react"
import { backdropUrl, drawScene, sceneFromRecipe } from "@/lib/calls/processors/backdrops"
import { forgetPicture, keepPicture, readPicture } from "@/lib/calls/processors/picture"
import { callToast } from "@/components/livekit/callSurface"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import type { ComposerProps } from "./composerFrame"
import type { EffectsFoot } from "./effectsFoot"
import type { PickerControls } from "./pickerControls"
import type { CallEffectsControl } from "./useCallEffects"
import { EffectsPicker } from "./EffectsPicker"


/** What the picker says while the CPU watch has made the effects lighter. */
export const LIGHTER_NOTE = "Lighter for now: this device is busy."

/** What a surface hands the chooser (chooserPart.tsx's Part takes the same): `controls`, the picker's shared controls (pickerControls.ts). */
export type ChooserProps = { control: CallEffectsControl; controls: PickerControls; problem?: string | null; columns?: 3 | 4; Composer?: React.ComponentType<ComposerProps>; foot?: EffectsFoot }

/** A made scene's picture, drawn here for the composer (ComposerProps.paint), where the backdrops are loaded already. */
const paintMade: ComposerProps["paint"] = (recipe) => drawScene(sceneFromRecipe(recipe))

export default function EffectsChooser({ control, controls, problem, columns, Composer, foot }: ChooserProps) {
  const [unavailable, setUnavailable] = React.useState<string | null>(null)
  const [picture, setPicture] = React.useState<string | null>(() => readPicture())
  const [note, setNote] = React.useState<string | null>(null)
  const [scene, setScene] = React.useState<string | null>(() => readPicture("scene"))
  const [sceneNote, setSceneNote] = React.useState<string | null>(null)
  const [composing, setComposing] = React.useState(false)
  const box = React.useRef<HTMLDivElement>(null)
  // The scene's tile after the composer closes: "put" (Use this) brings it into view with the focus; "closed" gives
  // it the focus only where the composer's going dropped it.
  const [toTile, setToTile] = React.useState<"put" | "closed" | null>(null)
  React.useEffect(() => {
    if (!toTile) return
    setToTile(null)
    const tile = box.current?.querySelector<HTMLElement>('[role="radio"][value="scene"]')
    if (!tile) return
    const now = document.activeElement
    if (toTile === "put") tile.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
    if (toTile === "put" || !now || !now.isConnected || now.contains(tile)) tile.focus({ preventScroll: true })
  }, [toTile])
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
  // A scene painted from the model's recipe: kept in its own slot, the same way as a picture, and put on live.
  const use = async (picture: Blob) => {
    try {
      const { url, remembered } = await keepPicture(new File([picture], "scene.jpg", { type: picture.type || "image/jpeg" }), "scene")
      setScene(url)
      setSceneNote(remembered ? null : "This browser won't keep your scene, so it lasts until you close the page.")
      setComposing(false)
      setToTile("put")
      control.setBackground({ kind: "scene", at: Date.now() })
    } catch (e) {
      callToast({ title: "That scene can't be used", description: (e as Error).message, variant: "destructive" })
    }
  }
  return (
    <div ref={box} className="contents">
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
        scene={
          Composer || scene
            ? {
                url: scene,
                note: sceneNote,
                onMake: Composer ? () => setComposing(true) : undefined,
                onForget: () => {
                  forgetPicture("scene")
                  setScene(null)
                  setSceneNote(null)
                  if (control.effects.background.kind === "scene") control.setBackground({ kind: "none" })
                },
                composer:
                  Composer && composing ? (
                    <Composer
                      onUse={use}
                      onClose={() => {
                        setComposing(false)
                        setToTile("closed")
                      }}
                      paint={paintMade}
                      foot={foot}
                    />
                  ) : null,
              }
            : undefined
        }
      />
    </div>
  )
}
