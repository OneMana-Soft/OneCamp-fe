"use client"

import { lazyPart } from "@/lib/lazy/lazyPart"

/** The limit note (./SeatLimitNote), its one way in: its code comes when it is first drawn, near or at the limit. */
export const LimitNote = lazyPart(() => import("./SeatLimitNote").then((m) => m.SeatLimitNote))
