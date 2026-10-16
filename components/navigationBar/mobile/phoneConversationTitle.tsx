"use client"

import Link from "next/link"
import { PRESENCE_WORDS, presenceOf } from "@/lib/presence"
import { useDispatch, useSelector } from "react-redux"

import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { openChannelDetails } from "@/components/channel/details/openChannelDetails"
import { GroupedAvatar } from "@/components/groupedAvatar/groupedAvatar"
import { Headphones } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { userDisplayName } from "@/lib/utils/userDisplayName"
import { GetEndpointUrl } from "@/services/endPoints"
import type { LocallyCreatedGrpInfoInterface } from "@/store/slice/groupChatSlice"
import { openUI } from "@/store/slice/uiSlice"
import type { RootState } from "@/store/store"
import type { ChannelInfoInterfaceResp } from "@/types/channel"
import { app_channel_call, app_chat_call } from "@/types/paths"
import { type RawUserDMInterface, type UserProfileInterface } from "@/types/user"
import { ChannelGuestTag } from "@/components/channel/channelGuestTag"
import { useConversationMissing } from "@/hooks/useConversationMissing"
import type { ConversationKind } from "@/lib/mqtt/conversationAccess"

/**
 * The phone's conversation bar title (design v3 chat, C62), one component for
 * a channel, a DM and a group: a centred 17/22 590 title ("#" in ink-3 before
 * a channel's name, a group's 24px stack before its names) and a 12px ink-3
 * line under it ("4 members · 1 agent", a person's status, "3 people").
 * Tapping it opens the conversation's details. The bar itself is the shell's
 * (52px on the sheet, its hairline once the list scrolls).
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function TitleButton({ title, subtitle, onClick, label }: { title: React.ReactNode; subtitle?: string; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            data-conversation-title=""
            data-touch-target=""
            onClick={onClick}
            aria-label={label}
            className="flex min-w-0 max-w-full flex-col items-center rounded-md px-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
            <span className="flex min-w-0 max-w-full items-center gap-1.5 text-title-3 leading-[22px] font-[590] text-ink">{title}</span>
            {subtitle ? <span data-conversation-subtitle="" className="max-w-full truncate text-meta leading-4 text-ink-3">{subtitle}</span> : null}
        </button>
    )
}

function ChannelTitle({ id }: { id: string }) {
    const dispatch = useDispatch()
    const info = useFetch<ChannelInfoInterfaceResp>(id ? `${GetEndpointUrl.ChannelBasicInfo}/${id}` : "")
    const ch = info.data?.channel_info
    const sidebarName = useSelector((s: RootState) => s.users.userSidebar.userChannels?.find((c) => c.ch_uuid === id)?.ch_name)
    const name = sidebarName || ch?.ch_name || ""
    const members = ch?.ch_member_count ?? 0
    const subtitle = ch ? plural(members, "member") : undefined
    return (
        <TitleButton
            label={`${name || "Channel"}, details`}
            onClick={() => dispatch(openChannelDetails(id))}
            title={
                <>
                    <span aria-hidden="true" className="text-ink-3">#</span>
                    <span className="truncate">{name}</span>
                    {ch?.has_guest_access && <ChannelGuestTag />}
                </>
            }
            subtitle={subtitle}
        />
    )
}

function DmTitle({ id }: { id: string }) {
    const dispatch = useDispatch()
    const other = useFetchOnlyOnce<UserProfileInterface>(`${GetEndpointUrl.SelfProfile}/${id}`)
    const state = useUserInfoState(id)
    const person = other.data?.data
    const loaded = state && state.deviceConnected !== -1
    const name = state.userName || userDisplayName(person)
    const said = state.emojiStatus?.status_user_emoji_desc
    // Where they are, as a computer's header says it (lib/presence, QA F-18).
    const subtitle = said || (person || loaded ? PRESENCE_WORDS[presenceOf(state, person)] : undefined)
    return (
        <TitleButton
            label={`${name || "Person"}, profile`}
            onClick={() => dispatch(openUI({ key: "otherUserProfile", data: { userUUID: id } }))}
            title={<span className="truncate">{name}</span>}
            subtitle={subtitle}
        />
    )
}

const NO_GROUP = {} as LocallyCreatedGrpInfoInterface

function GroupTitle({ id }: { id: string }) {
    const dispatch = useDispatch()
    const fetched = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${id}`)
    const local = useSelector((s: RootState) => s.groupChat.locallyCreatedGrpInfo[id] || NO_GROUP)
    const people = local.participants || fetched.data?.data?.dm_participants || []
    const names = people.map((p) => userDisplayName(p)).join(", ")
    return (
        <TitleButton
            label={`${names || "Group"}, members`}
            onClick={() => dispatch(openUI({ key: "editDmMember", data: { grpId: id } }))}
            title={
                <>
                    <GroupedAvatar users={people} max={2} overlap={8} size={24} className="shrink-0 !pr-0" />
                    <span className="truncate">{names}</span>
                </>
            }
            subtitle={people.length ? plural(people.length, "person", "people") : undefined}
        />
    )
}

export function PhoneConversationTitle({ kind, id }: { kind: ConversationKind; id: string }) {
    // A conversation that isn't there has no title: the page says why (QA F-08).
    const { missing } = useConversationMissing(kind, id)
    if (missing) return null
    if (kind === "channel") return <ChannelTitle id={id} />
    if (kind === "dm") return <DmTitle id={id} />
    return <GroupTitle id={id} />
}

/**
 * The huddle on the phone's conversation bar (C06 phone variant): a moss
 * circle in a 44px target. Live, the circle is solid moss with the live dot's
 * ring; otherwise the moss tint with the headphones.
 */
export function PhoneHuddleButton({ kind, id }: { kind: "channel" | "dm"; id: string }) {
    const live = useSelector((s: RootState) =>
        kind === "channel" ? !!s.channel.channelCallStatus[id]?.active : !!s.chat.chatCallStatus?.[id]?.active,
    )
    // No huddle in a conversation that isn't there (QA F-08).
    const { missing } = useConversationMissing(kind, id)
    if (missing) return null
    const href = `${kind === "channel" ? app_channel_call : app_chat_call}/${id}`
    return (
        <Link
            href={href}
            aria-label={live ? "Join the huddle in progress" : "Start a huddle"}
            data-phone-huddle={live ? "live" : ""}
            data-press="icon"
            className="grid size-11 place-items-center rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        >
            <span
                className={cn(
                    "relative grid size-8 place-items-center rounded-full [&_svg]:size-4",
                    live ? "bg-camp-moss text-white" : "bg-camp-moss-tint text-camp-moss-ink",
                )}
            >
                {live ? <span aria-hidden="true" className="absolute inset-0 rounded-full bg-camp-moss motion-safe:animate-live-halo" /> : null}
                <Headphones aria-hidden="true" className="relative" />
            </span>
        </Link>
    )
}

/** What the phone's bar offers for a conversation, only while it is there (QA F-08). */
export function WhileConversationThere({ kind, id, children }: { kind: ConversationKind; id: string; children: React.ReactNode }) {
    const { missing } = useConversationMissing(kind, id)
    return missing ? null : <>{children}</>
}
