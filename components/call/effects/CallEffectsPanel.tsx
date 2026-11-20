"use client"

// The call's Effects panel: the picker beside the stage (a right column on a
// computer, over the stage on a phone), where the person sees their own tile
// change as they choose. Loaded when it is first opened. A background made
// from words keeps its actions in the panel's pinned foot, at every width
// (effectsFoot.tsx): on a phone the panel covers the dock, as the chat does,
// and the foot is the screen's footer, clear of the home indicator.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { X } from "@/lib/icons"
import type { CallEffectsControl } from "./useCallEffects"
import { chooser } from "./chooserPart"
import { PICKER_CONTROLS } from "./pickerControls"
import { CALL_PANEL_FOOT } from "@/components/livekit/callPanelClasses"
import { useEffectsFoot } from "./effectsFoot"

export default function CallEffectsPanel({ control, onClose, made }: { control: CallEffectsControl; onClose: () => void; made?: boolean }) {
  const titleId = React.useId()
  const { foot, footer } = useEffectsFoot()
  return (
    <aside
      aria-labelledby={titleId}
      data-call-effects=""
      className="hub-panel-in flex h-full w-full flex-col overflow-hidden bg-[#131416] text-foreground @3xl:my-3 @3xl:mr-3 @3xl:h-[calc(100%-24px-84px)] @3xl:w-[320px] @3xl:rounded-[14px] @3xl:shadow-e3 @7xl:h-[calc(100%-24px-100px)]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 id={titleId} className="text-heading leading-tight">
          Backgrounds and sound
        </h2>
        <Button data-tone="light" aria-label="Close backgrounds and sound" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:text-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <chooser.Part control={control} controls={PICKER_CONTROLS} made={made} foot={foot} />
      </div>
      {/* The side panels' foot (Chat's, Q&A's), marked as the sheets' (data-sheet-footer: phone.css's fade over what scrolls under it). */}
      {footer ? (
        <div data-sheet-footer="" data-overlay-footer="" className={`relative ${CALL_PANEL_FOOT}`}>
          {footer}
        </div>
      ) : null}
    </aside>
  )
}
