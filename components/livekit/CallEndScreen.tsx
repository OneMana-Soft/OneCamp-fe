"use client"

// How a call ended, said the one way on every page (calls audit): left, with
// how long and the way back in; removed, with why and no Rejoin (CALL-BUG-11);
// never connected, with why and Try again (CALL-BUG-23). A guest's page draws
// it on its own public frame, in "meeting" words.

import { CallLeft, CallRemoved } from "./CallStage"
import type { CallLifecycle } from "./useCallLifecycle"
import { CONNECT_FAILURE_TEXT } from "./callErrors"
import { removedText } from "./callState"
import { GuestCentered } from "@/components/guest/guestUi"
import { Tile } from "@/components/ui/graphics/Tile"
import { Button } from "@/components/ui/button"
import { UserMinus, Video, WifiOff } from "@/lib/icons"

export function CallEndScreen({
  call,
  guest = false,
  noun = "call",
  onBack,
  backLabel,
  embedded,
}: {
  call: Pick<CallLifecycle, "phase" | "end" | "minutes" | "retry" | "reset">
  guest?: boolean
  /** "call" or "meeting", in the titles. */
  noun?: "call" | "meeting"
  onBack?: () => void
  backLabel?: string
  embedded?: boolean
}) {
  const { phase, end } = call
  if (phase === "failed") {
    const title = `Couldn't connect to the ${noun}`
    const detail = CONNECT_FAILURE_TEXT[end?.failed ?? "network"]
    if (guest) {
      return (
        <GuestCentered>
          <Tile hue="sun" size="lg"><WifiOff /></Tile>
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground" role="status">{detail}</p>
          <Button onClick={call.reset}>Try again</Button>
        </GuestCentered>
      )
    }
    return <CallRemoved kind="failed" title={title} detail={detail} primary={{ label: "Try again", onClick: call.retry }} onBack={onBack} backLabel={backLabel} embedded={embedded} />
  }
  if (phase === "removed") {
    const { title, detail } = removedText(end?.removed ?? null, guest)
    if (guest) {
      return (
        <GuestCentered>
          <Tile hue="berry" size="lg"><UserMinus /></Tile>
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground" role="status">{detail} You can close this tab.</p>
        </GuestCentered>
      )
    }
    return <CallRemoved title={title} detail={detail} onBack={onBack} backLabel={backLabel} embedded={embedded} />
  }
  if (phase === "left") {
    // Any disconnect after connecting lands here, a dropped connection
    // included, and the way back in is one press.
    if (guest) {
      return (
        <GuestCentered>
          <Tile hue="sky" size="lg"><Video /></Tile>
          <h1 className="text-base font-semibold text-foreground">You left the {noun}</h1>
          <p className="text-sm text-muted-foreground">If you dropped out by mistake, join again under the same name. Otherwise you can close this tab.</p>
          <Button onClick={call.reset}>Join again</Button>
        </GuestCentered>
      )
    }
    return <CallLeft minutes={call.minutes} onRejoin={call.reset} onBack={onBack} backLabel={backLabel} embedded={embedded} />
  }
  return null
}
