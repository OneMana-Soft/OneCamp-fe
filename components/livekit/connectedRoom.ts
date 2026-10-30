import { RoomEvent, type Room } from "livekit-client"

/** What someone reads when they act on a call they aren't connected to yet. */
export const NOT_CONNECTED_YET = "You aren't connected to the call yet. Try again in a moment."

/**
 * The room's name, for a request about the call: at once while it has one,
 * else as soon as LiveKit says Connected, within `ms`. LiveKit takes the name
 * from the join's answer, so a room still connecting has none, and the server
 * can't tell which call a request is for ("Say which call.", V-30). Undefined
 * when the room doesn't connect in time, or the call ends first.
 */
export function connectedRoomName(room: Pick<Room, "name" | "on" | "off">, ms = 15_000): Promise<string | undefined> {
  if (room.name) return Promise.resolve(room.name)
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      room.off(RoomEvent.Connected, done)
      room.off(RoomEvent.Disconnected, done)
      resolve(room.name || undefined)
    }
    const timer = setTimeout(done, ms)
    room.on(RoomEvent.Connected, done)
    room.on(RoomEvent.Disconnected, done)
  })
}
