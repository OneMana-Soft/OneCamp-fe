import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { conversationPath } from "@/lib/conversation/conversationPath"

/**
 * The conversation service's calls (business/Conversation, chat A9): adding
 * people to a DM or group, which opens the group of the new set of people (a
 * group is never re-keyed) with as much history as the person adding them
 * shares; a group's name; hiding a DM or group until a newer message comes;
 * leaving a group; making one a private channel. Each call leaves its
 * failure to the screen that made it (OWN_ERRORS), which says it through
 * apiErrorMessage.
 */

/** A DM or group, as the service names it: a DM by both people's ids with a space between, a group by its id. */
export interface ChatPlace {
  kind: "dm" | "group"
  id: string
}

/** How much earlier history the people added get. */
export type Share = "none" | "day" | "week" | "all"

/** One choice of "Share earlier messages?": what there is, and how much of it a share copies. */
export interface ShareChoice {
  share: Share
  messages: number
  replies: number
  /** How many messages and replies a share copies: all of them, or the newest that fit within cap. */
  shared: number
  capped: boolean
  cap: number
}

/** The conversation people were taken to. */
export interface Opened {
  kind: "channel" | "dm" | "group"
  id: string
  /** There was one already, for exactly those people. */
  existed?: boolean
  /** How many earlier messages and replies are being copied in. */
  sharing?: number
}

/** The service's path for a place: /conversations/{kind}/{id}/{rest}, the id escaped (a DM's holds a space). Pure. */
export function placePath(place: { kind: "channel" | "dm" | "group"; id: string }, rest: string): string {
  return conversationPath(place.kind, place.id, rest)
}

/** The key "Share earlier messages?" reads its choices from. Pure. */
export function shareChoicesKey(place: ChatPlace): string {
  return placePath(place, "share-choices")
}

/** Opens the group of the people in place with those added, sharing what share says. */
export async function addPeople(place: ChatPlace, people: string[], share: Share): Promise<Opened> {
  const res = await axiosInstance.post<{ data: Opened }>(placePath(place, "people"), { people, share }, OWN_ERRORS)
  return res.data.data
}

/** Hides a DM or group from the sidebar until a newer message comes, or shows it again. */
export async function setHidden(place: ChatPlace, hidden: boolean): Promise<void> {
  await axiosInstance.post(placePath(place, "hidden"), { hidden }, OWN_ERRORS)
}

/** Takes the person asking out of a group: its messages stop reaching them. The server refuses a group of three, in words. */
export async function leaveGroup(groupId: string): Promise<void> {
  await axiosInstance.post(placePath({ kind: "group", id: groupId }, "leave"), {}, OWN_ERRORS)
}

/** Names a group, or with "" takes its name away. */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  await axiosInstance.post(placePath({ kind: "group", id: groupId }, "name"), { name }, OWN_ERRORS)
}

/** Makes the private channel a DM or group continues in, with its people and those in add, and its history when asked. */
export async function makePrivateChannel(place: ChatPlace, name: string, copyHistory: boolean, add: string[] = []): Promise<Opened> {
  const res = await axiosInstance.post<{ data: Opened }>(placePath(place, "private-channel"), { name, people: add, copy_history: copyHistory }, OWN_ERRORS)
  return res.data.data
}
