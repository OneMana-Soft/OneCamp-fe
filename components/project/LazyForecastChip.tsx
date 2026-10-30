"use client"

import type { ComponentProps } from "react"
import { lazyPart } from "@/lib/lazy/lazyPart"
import type { ForecastChip as Chip } from "./ForecastChip"
import { ForecastChipSlot } from "./ForecastChipSlot"

type Props = ComponentProps<typeof Chip>

// The forecast's chip is a chunk of its own, and its card another, fetched on the chip's first press (linear-20; the
// project route's first-load line, V-49). When the chip's code can't come, its slot is left empty and the header
// carries on, and the chip comes once the browser is back online (lib/lazy/lazyPart).
const chip = lazyPart<Props>(() => import("./ForecastChip").then((m) => m.ForecastChip), { placeholder: ForecastChipSlot })

/** ForecastChip from its own chunk, for the project's header line and its phone row. */
export const LazyForecastChip = chip.Part
