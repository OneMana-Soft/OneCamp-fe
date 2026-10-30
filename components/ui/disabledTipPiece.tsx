"use client"

import { lazyPiece } from "@/lib/lazy/lazyPiece"

/**
 * DisabledTip as the one lazy piece Button and TaskCheck draw a disabled
 * control's reason with: fetched the first time a control has a reason to say,
 * so no first load carries a tooltip for a control that may never be disabled.
 * A client module of its own because Button also draws in server components,
 * and those can't call lazyPiece (a client function) at their top, as they
 * could React.lazy.
 */
export const DisabledTipPiece = lazyPiece(() => import("@/components/ui/disabledTip"))
