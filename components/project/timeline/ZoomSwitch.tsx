"use client"

import { WorkSegmented } from "@/components/task/WorkTabs"
import { ZOOMS, type Zoom } from "@/lib/timeline"

/**
 * The zoom (work.md W23): the work area's one segmented control, so it looks,
 * moves and answers the arrows as Display's and the overview's do. It was a
 * third copy, with 64 px segments, a smaller radius and fainter labels. The
 * timeline itself answers − and +.
 */
export function ZoomSwitch({ value, onChange }: { value: Zoom; onChange: (z: Zoom) => void }) {
  return <WorkSegmented label="Zoom" value={value} onChange={onChange} options={ZOOMS} />
}
