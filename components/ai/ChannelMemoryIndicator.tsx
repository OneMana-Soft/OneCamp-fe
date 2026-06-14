"use client"

/**
 * ChannelMemoryIndicator — a calm trust signal in the channel header.
 *
 * OneCamp's AI memory layer continuously captures decisions/commitments from
 * channel content. That power demands visible trust controls: when a channel
 * has been opted OUT of memory (a sensitive channel an admin paused), members
 * deserve to KNOW at a glance — "nothing here is fed to AI". This surfaces
 * exactly that, and ONLY that: it renders nothing in the common "capturing"
 * case (no noise) and a small "AI memory paused" pill when excluded.
 *
 * Reads the per-channel exclusion via SWR (deduped + cached across header
 * re-opens, so it's one tiny GET per channel). Member-visible by design — the
 * read is access-gated to channel members/admins on the backend; only
 * CHANGING it requires an admin (handled in the memory panel). We therefore
 * only fetch when the viewer is a member: a non-member browsing a public
 * channel has no memory relationship to this channel and the backend would
 * (correctly) 403 the read, so firing it would just spam the global error
 * toast. Fails closed-quiet: any error renders nothing rather than a
 * misleading state.
 */

import React from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Sparkles } from "@/lib/icons"

interface ExclusionResponse {
  data?: { excluded?: boolean }
}

export const ChannelMemoryIndicator: React.FC<{ channelUUID: string; isMember?: boolean }> = ({
  channelUUID,
  isMember,
}) => {
  // Reuse the canonical endpoint URL the memory service uses, so SWR shares
  // a cache key with any other reader of this channel's exclusion state.
  // Only fire for members — see the note above; passing "" to useFetch makes
  // it a no-op so non-members never hit the access-gated endpoint.
  const { data } = useFetch<ExclusionResponse>(
    channelUUID && isMember
      ? `${GetEndpointUrl.GetChannelMemoryExclusion}?channel=${encodeURIComponent(channelUUID)}`
      : "",
    undefined,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )

  // Only surface the EXCEPTION (paused). The default capturing state is
  // implicit and shown in the memory panel, so the header stays quiet.
  if (!data?.data?.excluded) return null

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
      title="An admin has paused AI memory capture for this channel — nothing here is added to workspace memory."
    >
      <Sparkles className="h-3 w-3" />
      AI memory paused
    </span>
  )
}
