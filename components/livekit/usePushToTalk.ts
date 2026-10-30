"use client"

// Push to talk in the call (calls meet-18): holding Space while muted opens the
// microphone until it's let go (lib/calls/pushToTalk), a preference kept on
// this device and on by default, as Zoom's is. Leaving the page while it's
// held counts as letting go, so a hold never leaves the microphone open. It
// switches through the microphone's one switch, shared with the dock
// (lib/calls/deviceSwitch): Space let go before the microphone opened closes
// it once it has, and a microphone that won't open or close says so there.
// Answers whether Space is holding it open now.

import { useEffect, useRef, useState } from "react"
import { RELEASED, isTalkKey, onTalkDown, onTalkUp } from "@/lib/calls/pushToTalk"
import type { DeviceSwitch } from "@/lib/calls/deviceSwitch"
import { useStableCallback } from "@/hooks/useStableCallback"

const TALK_KEY = "onecamp.call.pushToTalk"

/** Whether holding Space talks while muted on this device (calls meet-18): on unless turned off. */
export function readPushToTalk(): boolean {
  try {
    return window.localStorage.getItem(TALK_KEY) !== "off"
  } catch {
    return true
  }
}

export function writePushToTalk(on: boolean): void {
  try {
    window.localStorage.setItem(TALK_KEY, on ? "on" : "off")
  } catch {
    /* this page only, then */
  }
}

export function usePushToTalk(enabled: boolean, micOn: boolean, mic: DeviceSwitch): boolean {
  const [talking, setTalking] = useState(false)
  const hold = useRef(RELEASED)
  // Where the microphone is headed, else as shown, for key listeners that
  // live as long as `enabled` does: one the dock is opening is open already.
  const micNow = useStableCallback(() => mic.heading() ?? micOn)
  useEffect(() => {
    if (!enabled) return
    const down = (e: KeyboardEvent) => {
      if (!hold.current.held && !isTalkKey(e)) return
      if (hold.current.held && e.code !== "Space" && e.key !== " ") return
      const r = onTalkDown(hold.current, e, micNow())
      hold.current = r.hold
      if (r.prevent) e.preventDefault()
      if (!r.unmute) return
      setTalking(true)
      void mic.to(true).then((opened) => {
        if (opened) return
        // It didn't open, or a later press took its place: nothing to close.
        hold.current = RELEASED
        setTalking(false)
      })
    }
    const release = () => {
      if (!hold.current.held) return
      const r = onTalkUp(hold.current)
      hold.current = r.hold
      setTalking(false)
      if (r.mute) void mic.to(false)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") release()
    }
    const hidden = () => {
      if (document.visibilityState !== "visible") release()
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", release)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      release()
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", release)
      document.removeEventListener("visibilitychange", hidden)
    }
  }, [enabled, micNow, mic])
  return talking
}
