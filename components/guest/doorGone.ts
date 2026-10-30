// A dead door's words, the same for a guest and a member at one link (CR-86
// SF2): RoomDoorway's room, /guest/m's meeting link, and MemberDoorView.
export const ROOM_GONE = { noun: "room", detail: "Its owner may have closed it or given it a new address. Ask whoever invited you for the room's link." } as const
export const LINK_GONE = { noun: "meeting link", detail: "The meeting may have ended, or the invite expired or was turned off. Ask the host for a new link." } as const
