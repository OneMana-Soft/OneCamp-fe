"use client"

import type { Room } from "livekit-client"
import { ToastAction } from "@/components/ui/toast"
import { publishedSwitch } from "@/lib/calls/deviceSwitch"
import { callToast } from "./callSurface"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"

/**
 * "Asked to unmute": the one notice with a button, Unmute, which turns your
 * microphone on only when you press it (the server never does), through the
 * dock's one microphone switch: a press while push to talk or the dock is
 * switching it waits for that, never asks the browser twice, and says why if
 * the browser refuses, as the dock does. The dock is up for as long as the
 * call is; once you've left, Unmute has nothing to turn on. Loaded with the
 * first such notice, so the toast's parts aren't in a call's first load.
 */
export function askToUnmute(room: Room, title: string, detail?: string, by?: string) {
  callToast({
    title,
    description: detail,
    tone: "person",
    icon: by ? <IdentityMark variant="avatar" size={24} id={avatarSeed(by)} label={by} /> : undefined,
    action: (
      <ToastAction altText="Unmute your microphone" onClick={() => void publishedSwitch(room, "microphone")?.to(true)}>
        Unmute
      </ToastAction>
    ),
  })
}
