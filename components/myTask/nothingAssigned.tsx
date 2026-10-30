"use client"

import { useDispatch } from "react-redux"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotTasks } from "@/components/ui/graphics/spots"
import { openUI } from "@/store/slice/uiSlice"

/**
 * My tasks with nothing assigned, on a computer and a phone alike. It says only
 * what stays true whatever else waits: under "2 to approve", a phone's "You're
 * all caught up" did not (R2b's design review, 23 Oct). Its one action is 44px
 * tall under a finger, 32px with a mouse.
 */
export function NothingAssigned() {
  const dispatch = useDispatch()
  return (
    <EmptyState
      illustration={<SpotTasks />}
      title="Nothing assigned to you"
      description="Tasks you're given, or make for yourself, land here."
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => dispatch(openUI({ key: "createTask", data: { assignToMe: true } }))}
          className="pointer-coarse:h-11"
        >
          New task
        </Button>
      }
    />
  )
}
