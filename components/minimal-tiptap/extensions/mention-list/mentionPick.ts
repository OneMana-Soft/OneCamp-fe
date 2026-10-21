import type { UserProfileDataInterface } from "@/types/user"
import type { DateRow } from "./mentionInDoc"
import type { MentionPlace } from "@/lib/conversation/mentionPlace"
import type { Broadcast, Mentionables, TeamOffer } from "@/lib/conversation/mentionables"

// The "@" list's rows (chat P3): shared by its options (mentionList.tsx) and
// its view (mentionListView.tsx, loaded when the list first opens).

export type MentionSuggestion = {
  id: string;
  mentionLabel: string;
  label: string
};

/** A team the writer may mention (chat P3): its people in the conversation are told. */
export type TeamRow = { team: TeamOffer }
/** A room's mention: @here, @channel, @everyone; why is set when it notifies no one here. */
export type BroadcastRow = { broadcast: Broadcast; count: number; channel: string; why?: string }
/** What the list knows of the conversation: its name, who isn't in it, and whose night it is. */
export type PlaceRow = { place: MentionPlace; known: Mentionables; notHere: Set<string>; night: Record<string, string> }

export type MentionPick = UserProfileDataInterface | DateRow | TeamRow | BroadcastRow | PlaceRow
export const isDate = (p: MentionPick): p is DateRow => "offer" in p
export const isTeam = (p: MentionPick): p is TeamRow => "team" in p
export const isBroadcast = (p: MentionPick): p is BroadcastRow => "broadcast" in p
export const isPlace = (p: MentionPick): p is PlaceRow => "known" in p
export const isPerson = (p: MentionPick): p is UserProfileDataInterface => !isDate(p) && !isTeam(p) && !isBroadcast(p) && !isPlace(p)
