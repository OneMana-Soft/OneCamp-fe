/**
 * The app's one search over people, channels and groups (POST /user/searchUserAndChannelList), as its pickers list
 * it: forwarding a message (components/searchDropdown/fwdMsgToDropdown) and starting a call from a board
 * (components/board/boardCallStart). Pure.
 */

import type { ChannelAndUserListInterfaceResp } from "@/types/user"
import type { SearchableItem } from "@/types/search"

export interface SearchPlace extends SearchableItem {
  type: "user" | "channel" | "groupChat"
  user_profile_object_key?: string
  user_uuid?: string
  user_dgraph_uid?: string
  channel_uuid?: string
  channel_dgraph_uid?: string
  user_name?: string
  channel_name?: string
  grp_id?: string
  grp_dgraph_uid?: string
  grp_name?: string
}

/** The search's answer as places, each by its id and name, leaving out any without an id. Pure. */
export function searchPlacesOf(list: ChannelAndUserListInterfaceResp[] | null | undefined): SearchPlace[] {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => ({
      id: item.user_uuid || item.channel_uuid || item.grp_id || "",
      name: item.user_name || item.channel_name || item.grp_name || "",
      type: (item.user_uuid ? "user" : item.grp_id ? "groupChat" : "channel") as SearchPlace["type"],
      user_profile_object_key: item.user_profile_object_key,
      user_uuid: item.user_uuid,
      user_dgraph_uid: item.user_dgraph_uid,
      channel_uuid: item.channel_uuid,
      channel_dgraph_uid: item.channel_dgraph_uid,
      user_name: item.user_name,
      channel_name: item.channel_name,
      grp_id: item.grp_id,
      grp_dgraph_uid: item.grp_dgraph_uid,
      grp_name: item.grp_name,
    }))
    .filter((p) => p.id)
}
