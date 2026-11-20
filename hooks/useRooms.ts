"use client"

// Rooms for the event form (gcal-6): the rooms free for the event's slot, and
// whether the reader may book one at all. Guests and bots are refused by the
// server (403), so the form never offers them a room.

import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { freeRoomsUrl, ROOMS, type Room } from "@/lib/calendar/rooms"
import type { UserProfileInterface } from "@/types/user"

/** The longest span the server finds free rooms over (B314 FreeRooms: 14 days). */
const FREE_SPAN_MS = 14 * 24 * 60 * 60 * 1000

/**
 * The rooms free from start to end seating capacity; undefined while it looks.
 * A slot that ends first asks nothing; one past the server's 14 days asks
 * nothing either and says tooLong, since a retry can't help.
 */
export function useFreeRooms(start: Date, end: Date, capacity: number): { rooms: Room[] | undefined; failed: boolean; tooLong: boolean; retry: () => void } {
  const span = end.getTime() - start.getTime()
  const tooLong = span > FREE_SPAN_MS
  const ok = !Number.isNaN(start.getTime()) && span > 0 && !tooLong
  const read = useFetch<{ data: Room[] }>(ok ? freeRoomsUrl(start, end, capacity) : "", undefined, { keepPreviousData: true }, OWN_ERRORS)
  return { rooms: tooLong ? undefined : (read.data?.data ?? undefined), failed: !tooLong && !!read.isError, tooLong, retry: () => void read.mutate() }
}

/**
 * The workspace's rooms, retired ones left out; undefined until asked and read.
 * The form asks only when no room is free, to tell "none free then" from "none
 * set up yet": one read on the directory's own key (listRooms reads the same
 * path), kept for the session however often the form asks.
 */
export function useRoomDirectory(ask: boolean): { rooms: Room[] | undefined; failed: boolean; retry: () => void } {
  const read = useFetchOnlyOnce<{ data: Room[] }>(ask ? ROOMS : "", undefined, undefined, OWN_ERRORS)
  if (!ask) return { rooms: undefined, failed: false, retry: () => void read.mutate() }
  return { rooms: read.data?.data?.filter((r) => !r.retired), failed: !!read.isError, retry: () => void read.mutate() }
}

/** A member may book rooms; a guest or a bot never, and nobody before the profile is read. */
export function useMayBookRooms(): boolean {
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const me = self.data?.data
  return !!me?.user_uuid && !me.is_external && !me.is_bot
}
