"use client"

/**
 * A project's cycles in another calendar (linear-12, part 4): a secret link of
 * the person's own, with each cycle as an all-day event and how much of it is
 * done. Anyone who may see the project may have one. On the shared link
 * dialog (components/dialog/feedLinkDialog.tsx), as the calendar's own link.
 */

import { FeedLinkDialog, useFeedLink, type FeedLink } from "@/components/dialog/feedLinkDialog"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { cycleFeedUrl } from "@/lib/work/backlog"

export default function CycleFeedDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const url = cycleFeedUrl(projectId)
  const feed = useFeedLink(url)
  return (
    <FeedLinkDialog
      feed={feed}
      title="Show cycles in your calendar"
      description="Google Calendar, Apple Calendar and Outlook read this link and show each of this project's cycles as an all-day event, with how much of it is done. Anyone who has the link sees them, so keep it to yourself."
      linkName="The cycles' calendar link"
      subject="the cycles' link"
      make={async () => (await axiosInstance.post(url, {}, OWN_ERRORS)).data.data as FeedLink}
      stop={async () => {
        await axiosInstance.post(`${url}/stop`, {}, OWN_ERRORS)
        return { live: false }
      }}
      onClose={onClose}
      data-cycle-feed-dialog=""
    />
  )
}
