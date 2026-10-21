"use client"

// The green room's Backgrounds and sound, as one lazy piece (PreJoin loads it
// on the preview's controls): the button, the picker (over the preview on a
// computer, a sheet from the bottom on a phone), and the background chosen on
// this device shown on the preview, as the call will send it. Nothing of it
// is in a call's first load.

import { useState } from "react"
import type { LocalTrack } from "livekit-client"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useMedia } from "@/context/MediaQueryContext"
import { useSheetMode } from "@/components/ui/overlayMode"
import { WandSparkles } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { CALL_SURFACE } from "@/components/livekit/callSurface"
import { DockButton } from "@/components/livekit/VideoControls"
import EffectsChooser from "./EffectsChooser"
import { useGreenRoomEffects } from "./useGreenRoomEffects"

const TITLE = "Backgrounds and sound"

export default function GreenRoomEffects({ preview }: { preview: LocalTrack | undefined }) {
  const effects = useGreenRoomEffects(preview)
  const [open, setOpen] = useState(false)
  const { isMobile } = useMedia()
  // A sheet on a phone, held either way (components/ui/overlayMode); the
  // layout's width picks its columns.
  const sheet = useSheetMode()
  const button = (
    <DockButton
      label={TITLE}
      state="on"
      pressed={open}
      aria-haspopup="dialog"
      aria-expanded={open}
      icon={<WandSparkles />}
      onClick={() => setOpen((o) => !o)}
      data-effects-entry=""
    />
  )
  const chooser = (columns: 3 | 4) => <EffectsChooser control={effects} problem={effects.problem} columns={columns} />

  if (sheet) {
    return (
      <>
        {button}
        <Drawer open={open} onOpenChange={setOpen} detent="large">
          <DrawerContent className={cn(CALL_SURFACE, "bg-[#131416] text-foreground")} header={<DrawerTitle className="text-heading">{TITLE}</DrawerTitle>}>
            <div className="px-4 pb-4">{chooser(isMobile ? 3 : 4)}</div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="flex">{button}</span>
      </PopoverAnchor>
      {/* Never taller than the room above the preview's controls: it scrolls inside instead. */}
      <PopoverContent
        side="top"
        sideOffset={10}
        collisionPadding={12}
        aria-label={TITLE}
        className={cn(CALL_SURFACE, "max-h-[min(560px,var(--radix-popover-content-available-height,70dvh))] w-[min(420px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[14px] border-0 bg-[#131416] p-4 pb-0 text-foreground shadow-e3")}
      >
        <h2 className="mb-3 text-heading leading-tight">{TITLE}</h2>
        {/* Four tiles to a row: the ten fit in three, and the whole picker in a laptop's window. */}
        {chooser(4)}
        {/* Where it still scrolls, the bottom edge fades, so there is plainly more. */}
        <div aria-hidden className="pointer-events-none sticky bottom-0 -mx-4 h-4 bg-gradient-to-t from-[#131416] to-transparent" />
      </PopoverContent>
    </Popover>
  )
}
