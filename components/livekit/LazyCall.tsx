"use client"

import { useEffect, type ComponentProps } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import { CallConnecting } from "./CallStage"

type CallProps = ComponentProps<typeof import("./VideoConference").VideoConference>

/** The connecting screen the call opens with, while its code comes. */
function Connecting({ place, embedded }: CallProps) {
  return <CallConnecting place={place} embedded={embedded} />
}

/** The call's code couldn't come: the join ends as a network failure, and the page offers Try again. */
function Failed(props: CallProps) {
  const { onDisconnect } = props
  useEffect(() => onDisconnect?.({ failed: "network" }), [onDisconnect])
  return <Connecting {...props} />
}

/**
 * The call, after the green room (lazyPart): none of a call page's first
 * load (the stage, the dock, LiveKit's room), so the green room is up
 * sooner. useCallLifecycle warms it once the page is idle and again on
 * Join, so it is usually in before it is wanted.
 */
const call = lazyPart<CallProps>(() => import("./VideoConference").then((m) => m.VideoConference), { placeholder: Connecting, failed: Failed })

export const LazyVideoConference = call.Part
export const warmCall = call.warm
