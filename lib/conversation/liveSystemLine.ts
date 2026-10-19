import type { Dispatch } from "@reduxjs/toolkit"
import { appMutate, patchCached } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import { nameSidebarChat } from "@/lib/conversation/sidebarChats"
import { isSystemLine, readSystemLine } from "@/lib/conversation/systemLine"
import type { RawUserDMInterface, UserDMInterface } from "@/types/user"

/** Where a live line arrived: the conversation, and its latest page's key. */
export interface LiveLinePlace {
  kind: "channel" | "dm" | "group"
  /** A channel's uuid, or a DM's or group's grouping id. */
  id: string
  latestKey: string
}

/**
 * What a system line arriving live changes beyond its own row
 * (lib/conversation/systemLine):
 *   - a group named, or its name taken away: the sidebar and the group's
 *     header say so at once, for everyone in it;
 *   - a shared history finished: the copies sit before the conversation's
 *     first line, which the list has already read past, so it reads its
 *     latest page again and pages back from there.
 * Anything else is only its row. chats is the sidebar's DMs and groups as they
 * are now (a group's name is written into them).
 */
export function followSystemLine(dispatch: Dispatch, place: LiveLinePlace, kind: string | undefined, system: string | undefined, chats?: UserDMInterface[]): void {
  if (!isSystemLine(kind)) return
  const facts = readSystemLine(system)
  if (!facts) return
  if (facts.kind === "group.renamed" && place.kind === "group") {
    const name = facts.name ?? ""
    nameSidebarChat(dispatch, chats, place.id, name)
    patchCached<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${place.id}`, (d) =>
      !d?.data || (d.data.dm_name ?? "") === name ? d : { ...d, data: { ...d.data, dm_name: name || undefined } },
    )
  }
  if (facts.kind === "history.shared" && place.latestKey) void appMutate(place.latestKey)
}
