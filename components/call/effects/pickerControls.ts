"use client"

// The picker's shared controls (the radio groups its backgrounds, touch-up
// and sound are chosen with, the segmented control, the person icon), handed
// to the lazy chooser by the surface that draws it: the green room's
// (GreenRoomEffects) and the call's panel (CallEffectsPanel), as
// the `controls` the chooser and the picker take. So they load where they did
// before the chooser was a chunk of its own: a member's with the app's first
// load, a guest's with the green room's and the call panel's own chunks. The
// chooser's chunk carries none of them, so it adds no chunk group to the
// modules the app's first load shares, which would re-cut it into one more
// chunk on every page (UX-CALLS-H4b size round, 12 Nov; callBuildsOnceGuard).
// The low-light switch stays the picker's own: handed in too, it moved enough
// code out of the chooser's chunk that the first load was re-cut anyway.
// The chooser and the picker take its type only (`import type`): importing a
// control from them would put it back in the chooser's chunk.

import * as RadioGroup from "@radix-ui/react-radio-group"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { User } from "@/lib/icons"

export const PICKER_CONTROLS = { RadioGroup, SegmentedControl, User }

export type PickerControls = typeof PICKER_CONTROLS
