"use client"

// Home, for a member who is in no channel at all.
//
// "Your channels" hid itself when there were none, so someone who had left
// every channel, or who joined before new members were put in #general, saw
// nothing on Home about channels: no hint that the team talks somewhere, and
// no way there but the sidebar. Now Home offers the channel new members start
// in ("Join #general", which opens it with the message box ready) and the list
// of channels to browse.

import { useRouter } from "next/navigation"
import { useSelector } from "react-redux"
import Link from "next/link"
import { RootState } from "@/store/store"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useSidenav } from "@/hooks/useHydrateUserSidebar"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { ChannelJoinInterface } from "@/types/channel"

interface SuggestedChannel {
  ch_uuid: string
  ch_name: string
}

export function NoChannelsYet() {
  const router = useRouter()
  const sidenav = useSidenav()
  const inSidebar = useSelector((state: RootState) => state.users.userSidebar.userChannels)
  // The server's answer, not only the store: the store is seeded from it a
  // render later, and "not in any channels" must not flash for a member of ten.
  const loaded = !!sidenav.data?.data
  const none = loaded && (sidenav.data?.data?.user_channels ?? []).length === 0 && (inSidebar ?? []).length === 0
  const suggested = useFetch<{ data: SuggestedChannel | null }>(none ? GetEndpointUrl.SuggestedChannel : "")
  const join = usePost()

  if (!none) return null
  const channel = suggested.data?.data ?? null

  const joinSuggested = async () => {
    if (!channel) return
    await join.makeRequest<ChannelJoinInterface>({
      apiEndpoint: PostEndpointUrl.JoinChannel,
      payload: { channel_uuid: channel.ch_uuid },
      // Into the channel with the message box ready, as a new member lands.
      onSuccess: () => router.push(`/app/channel/${channel.ch_uuid}?compose=1`),
    })
  }

  return (
    <section aria-labelledby="no-channels-title" className="rounded-lg border border-border/60 p-4">
      <h2 id="no-channels-title" className="text-sm font-semibold">You&apos;re not in any channels yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">Channels are where your team talks. Join one to see what&apos;s going on.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {channel && (
          <Button size="sm" onClick={() => void joinSuggested()} disabled={join.isSubmitting}>
            {join.isSubmitting ? "Joining…" : `Join #${channel.ch_name}`}
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link href="/app/channel?tab=join">Browse channels</Link>
        </Button>
      </div>
    </section>
  )
}
