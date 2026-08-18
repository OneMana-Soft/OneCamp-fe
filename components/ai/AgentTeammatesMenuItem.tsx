"use client"

/**
 * AgentTeammatesMenuItem — the "AI teammates" entry, with a count when something
 * is actually running.
 *
 * The problem it solves is discoverability without adding chrome. Live agent work
 * was reachable only from a menu item that looked identical whether three
 * teammates were mid-task or none were, so nobody opened it. The fix is one quiet
 * number on the entry that already exists — not a new badge, chip or panel in the
 * top bar. Nothing new to learn, nothing to dismiss.
 *
 * It fetches when it mounts, which for a dropdown item is the moment the menu
 * opens: the count is fresh exactly when someone is looking at it, and there is no
 * background polling for a number nobody is reading.
 */

import React, { useEffect, useState } from "react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Users } from "@/lib/icons"
import { listMyAgentWork } from "@/services/agentService"
import { withAI } from "@/components/common/withFeature"

const AgentTeammatesMenuItemUngated: React.FC<{ onSelect: () => void }> = ({ onSelect }) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let live = true
    listMyAgentWork(100)
      .then((items) => {
        if (live) setCount(items.length)
      })
      .catch(() => {
        // A failed count simply shows no count; the entry still works.
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <DropdownMenuItem onClick={onSelect}>
      <Users className="mr-2 h-4 w-4" />
      AI teammates
      {count > 0 && <span className="ml-auto text-2xs tabular-nums text-muted-foreground">{count}</span>}
    </DropdownMenuItem>
  )
}
// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
export const AgentTeammatesMenuItem = withAI(AgentTeammatesMenuItemUngated)
export default AgentTeammatesMenuItem
