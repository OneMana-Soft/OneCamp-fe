"use client"

import type { ComponentProps } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { lazyPart } from "@/lib/lazy/lazyPart"
import type { ConnectedTrigger as Trigger } from "./ConnectedTrigger"

type Props = ComponentProps<typeof Trigger>

/** Holds the button's slot at its size while its code comes, so the bar doesn't move when it arrives. */
function Slot(p: Props) {
  return <span aria-hidden="true" className={cn("inline-flex", p.className ?? "size-8")} />
}

// When the code can't come, the slot is left empty and the screen carries on,
// and the button comes once the browser is back online (lib/lazy/lazyPart).
// With React.lazy the failure went to the app's error boundary, and on a
// phone it took the top bar and the page with it.
const connected = lazyPart<Props>(() => import("./ConnectedTrigger").then((m) => m.ConnectedTrigger), { placeholder: Slot })

/** ConnectedTrigger from its own chunk, for a screen at its first-load line. */
export const LazyConnected = connected.Part
