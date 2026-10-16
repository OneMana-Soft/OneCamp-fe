"use client"

import { X } from "@/lib/icons"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { userDisplayName } from "@/lib/utils/userDisplayName"
import type { SearchWithin } from "@/lib/search/within"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

/**
 * The conversation a search is narrowed to, by name: "#engineering", the
 * person of a DM, or "this group". A channel's name comes from the sidebar's
 * read, which every page of the app has made: its own info read would mark
 * the channel seen.
 */
export function useWithinName(within: SearchWithin | null): string {
  const sidebar = useFetchOnlyOnce<UserProfileInterface>(within?.kind === "channel" ? GetEndpointUrl.SelfProfileSideNav : "")
  const channel = within?.kind === "channel" ? sidebar.data?.data?.user_channels?.find((c) => c.ch_uuid === within.id)?.ch_name : undefined
  const person = useFetchOnlyOnce<UserProfileInterface>(within?.kind === "dm" ? `${GetEndpointUrl.SelfProfile}/${within.id}` : "")
  if (!within) return ""
  if (within.kind === "channel") return channel ? `#${channel}` : "this channel"
  if (within.kind === "dm") return userDisplayName(person.data?.data) || "this conversation"
  return "this group"
}

/**
 * The scope of a search from a conversation's header, said and removable
 * (QA F-15): "In #engineering", with × to search everywhere instead.
 */
export function SearchWithinChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span data-search-within="" className="chip h-7 gap-1 pl-2.5 pr-1 text-ui-sm">
      In {name}
      <button
        type="button"
        data-touch-target=""
        onClick={onRemove}
        aria-label={`Search everywhere, not only in ${name}`}
        className="grid size-5 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  )
}
