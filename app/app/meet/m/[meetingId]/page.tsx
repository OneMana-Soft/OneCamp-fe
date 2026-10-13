"use client"

import { use } from "react"
import { InstantMeetingView } from "@/components/livekit/InstantMeetingView"

/**
 * An instant meeting's own page (CALL-BUG-17): its creator can always come
 * back to it, after leaving, reloading or closing the tab.
 */
export default function Page({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = use(params)
  return <InstantMeetingView meetingId={meetingId} />
}
