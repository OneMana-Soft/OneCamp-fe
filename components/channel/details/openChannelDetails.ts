import { openUI } from "@/store/slice/uiSlice"

/** The action that opens a channel's Details sheet (design v3 chat, C49). */
export const openChannelDetails = (channelUUID: string) => openUI({ key: "channelDetails", data: { channelUUID } })
