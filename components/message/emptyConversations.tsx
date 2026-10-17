"use client"

import { memo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useRouter } from "next/navigation"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useBotKindMap } from "@/hooks/useBotKinds"
import { GetEndpointUrl } from "@/services/endPoints"
import { displayNameOf } from "@/lib/personName"
import { isAIBot } from "@/lib/botCopy"
import { updateChannelInputText } from "@/store/slice/channelSlice"
import { createOrUpdateChatBody } from "@/store/slice/chatSlice"
import { createOrUpdateGroupChatBody } from "@/store/slice/groupChatSlice"
import { openChannelDetails } from "@/components/channel/details/openChannelDetails"
import { app_chat_call } from "@/types/paths"
import { Hand, Headphones, Pencil, UserPlus } from "@/lib/icons"
import { Spark } from "@/components/ui/graphics/motifs"
import { ConversationEmpty, type EmptyFace, type StarterChip } from "@/components/message/conversationEmpty"
import type { ChannelInfoInterfaceResp } from "@/types/channel"
import type { UserProfileDataInterface, UserProfileInterface } from "@/types/user"
import type { RootState } from "@/store/store"
import { shortDate } from "@/lib/utils/date/shortDate"

const HELLO = "<p>Hi everyone 👋</p>"

const faceOf = (u: UserProfileDataInterface): EmptyFace => ({ uuid: u.user_uuid, name: displayNameOf(u), profileKey: u.user_profile_object_key, isBot: !!u.is_bot })

/** "You created this channel on 19 Sep": where a channel's history begins, when no topic says more. */
export function channelOrigin(by: string | undefined, at: string | undefined, isMe: boolean): string {
    const when = at && !Number.isNaN(Date.parse(at)) ? ` on ${shortDate(new Date(at))}` : ""
    if (isMe) return `You created this channel${when}.`
    return by ? `${by} created this channel${when}.` : "What you write below starts the conversation."
}

/**
 * An empty channel (C58): its members on the orbit, and three ways to begin.
 * As the start of a channel with messages (`start`), the same orbit and
 * title head its history, with its topic or who made it and when, and no
 * "Say hello": the conversation has begun.
 */
export const ChannelEmpty = memo(function ChannelEmpty({ channelId, start = false }: { channelId: string; start?: boolean }) {
    const dispatch = useDispatch()
    const info = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : "").data?.channel_info
    const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    const sidebarName = useSelector((s: RootState) => s.users.userSidebar.userChannels?.find((c) => c.ch_uuid === channelId)?.ch_name)
    const kinds = useBotKindMap()
    const name = sidebarName || info?.ch_name || ""
    const members = info?.ch_members || []
    const people = members.filter((m) => !m.is_bot)
    const agents = members.filter((m) => m.is_bot && isAIBot(kinds?.[m.user_uuid]))
    const faces = [...people.slice(0, 4), ...agents.slice(0, 1)].map(faceOf)
    const draft = (html: string) => dispatch(updateChannelInputText({ channelId, inputTextHTML: html }))
    const chips: StarterChip[] = start ? [] : [{ label: "Say hello", icon: <Hand />, onClick: () => draft(HELLO) }]
    if (info?.ch_is_admin && !info?.ch_about) chips.push({ label: "Add a topic", icon: <Pencil />, onClick: () => dispatch(openChannelDetails(channelId)) })
    if (agents[0]) {
        const a = agents[0]
        chips.push({
            label: `Ask ${displayNameOf(a)} what it can do`,
            icon: <Spark size={14} />,
            onClick: () => draft(`<p><span data-type="mention" data-id="${a.user_uuid}@${a.uid ?? ""}" data-label="${displayNameOf(a)}">@${displayNameOf(a)}</span> what can you do here?</p>`),
        })
    } else {
        chips.push({ label: "Invite people", icon: <UserPlus />, onClick: () => dispatch(openChannelDetails(channelId)) })
    }
    const createdBy = info?.ch_created_by
    const origin = channelOrigin(createdBy ? displayNameOf(createdBy) : undefined, info?.ch_created_at, !!me && createdBy?.user_uuid === me)
    return (
        <ConversationEmpty
            kind="channel"
            channelId={channelId}
            placement={start ? "start" : "fill"}
            faces={faces}
            title={name ? `This is the start of #${name}` : "This is the start of the channel"}
            description={info?.ch_about || (start ? origin : "What you write below starts the conversation.")}
            chips={chips}
        />
    )
})

/**
 * An empty DM (C58): the other person's face, who they are, and two ways to
 * begin. As the start of a DM with messages (`start`), the face and the
 * title only.
 */
export const DmEmpty = memo(function DmEmpty({ chatId, start = false }: { chatId: string; start?: boolean }) {
    const dispatch = useDispatch()
    const router = useRouter()
    const other = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${chatId}`).data?.data
    const kinds = useBotKindMap()
    const name = other ? displayNameOf(other) : ""
    const agent = !!other?.is_bot && isAIBot(kinds?.[chatId])
    if (agent) {
        return (
            <ConversationEmpty
                kind="agent"
                placement={start ? "start" : "fill"}
                faces={other ? [faceOf(other)] : []}
                title={`${name} acts for you and can do only what you can`}
                description="Ask it anything it can do for you; it answers here."
            />
        )
    }
    const first = name.split(" ")[0]
    return (
        <ConversationEmpty
            kind="dm"
            placement={start ? "start" : "fill"}
            faces={other ? [faceOf(other)] : []}
            title={name ? `This is the start of your conversation with ${name}` : "No messages yet"}
            description="Messages you send here are between the two of you."
            chips={start ? [] : [
                { label: first ? `Say hello to ${first}` : "Say hello", icon: <Hand />, onClick: () => dispatch(createOrUpdateChatBody({ chatUUID: chatId, body: "<p>Hi 👋</p>" })) },
                { label: "Start a huddle", icon: <Headphones />, onClick: () => router.push(`${app_chat_call}/${chatId}`) },
            ]}
        />
    )
})

/** An empty group (C58): three of its faces and who is in it; as the start of a group with messages, without the chip. */
export const GroupEmpty = memo(function GroupEmpty({ grpId, start = false }: { grpId: string; start?: boolean }) {
    const dispatch = useDispatch()
    const info = useFetchOnlyOnce<{ data?: { dm_participants?: UserProfileDataInterface[] } }>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`).data?.data
    const people = info?.dm_participants || []
    const names = people.map((p) => displayNameOf(p).split(" ")[0])
    const list = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    return (
        <ConversationEmpty
            kind="group"
            placement={start ? "start" : "fill"}
            faces={people.slice(0, 3).map(faceOf)}
            title={list ? `This is the start of your group with ${list}` : "No messages in this group yet"}
            description={start ? "Messages here are between the people in this group." : "What you write below starts the conversation."}
            chips={start ? [] : [{ label: "Say hello", icon: <Hand />, onClick: () => dispatch(createOrUpdateGroupChatBody({ grpID: grpId, body: HELLO })) }]}
        />
    )
})
