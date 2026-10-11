"use client"

/**
 * A member's profile card (design v3, hub.md P1): a non-modal popover
 * anchored to whatever was pressed to open it (an avatar, a name, a mention;
 * see lib/hub/lastAnchor), and a bottom sheet on a phone. It replaced a
 * 448px modal in the middle of the screen: a profile is a glance, so the page
 * behind it stays live and Esc or a click outside puts it away.
 *
 * This file fetches and places; components/profile/profileCard.tsx draws.
 */
import { addressOrHandleOf, displayNameOf, handleOf } from "@/lib/personName"
import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useDispatch } from "react-redux"
import { useRouter } from "next/navigation"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { PrincipalTag } from "@/components/ui/principalTag"
import { BotTag } from "@/components/ui/botTag"
import { InvitePlaceholder } from "@/components/admin/InvitePlaceholder"
import { AgentStatePill, ProfileCard, type ProfileKind } from "@/components/profile/profileCard"
import { presenceOf } from "@/components/ui/presenceDot"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired"
import { GetEndpointUrl } from "@/services/endPoints"
import { updateUserInfoStatus } from "@/store/slice/userSlice"
import { openUI } from "@/store/slice/uiSlice"
import { isExternalUser } from "@/lib/utils/isExternalUser"
import { botProfileCopy } from "@/lib/botCopy"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { lastAnchorRect } from "@/lib/hub/lastAnchor"
import { forgetHoverCard, hoverCardProps } from "@/lib/hub/hoverIntent"
import { MessageSquare, Pencil, Smile } from "@/lib/icons"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { UserProfileInterface } from "@/types/user"

interface OtherProfileDialogProps {
    userUUID: string
    dialogOpenState: boolean
    setOpenState: (state: boolean) => void
}

/** A phone gets the bottom sheet; read once, when the card opens. */
function isPhone(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 639px)").matches
}

const OtherProfileDialog: React.FC<OtherProfileDialogProps> = ({ dialogOpenState, setOpenState, userUUID }) => {
    const router = useRouter()
    const dispatch = useDispatch()
    const profileInfo = useFetch<UserProfileInterface>(userUUID && dialogOpenState ? GetEndpointUrl.SelfProfile + "/" + userUUID : "")
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const p = profileInfo.data?.data
    const { src: imageSrc } = useUserAvatar(p?.user_profile_object_key)

    // Where it opens, fixed for as long as it is open.
    const [anchor] = useState(() => lastAnchorRect())
    const [phone] = useState(isPhone)

    useEffect(() => {
        if (!p) return
        dispatch(
            updateUserInfoStatus({
                userUUID: p.user_uuid || "",
                profileKey: p.user_profile_object_key || "",
                userName: p.user_name || "",
                status: p.user_status || "",
            }),
        )
    }, [p, dispatch])

    const live = useUserInfoState(userUUID)
    const loaded = live && live.deviceConnected !== -1
    const presence = presenceOf({
        status: loaded && live.status ? live.status : p?.user_status || "offline",
        devices: loaded ? live.deviceConnected : p?.user_device_connected || 0,
    })

    // Their status as set now: the live copy (MQTT keeps it current), else the
    // profile's; an expired one is none.
    const emojiData = useEmojiMartData()
    const status = live?.emojiStatus?.status_user_emoji_id ? live.emojiStatus : p?.user_emoji_statuses?.[0] ?? null
    const expired = useStatusIsExpired(status?.status_user_emoji_id ? status : null)
    const statusShown = useMemo(() => {
        if (!status || expired || !status.status_user_emoji_desc) return undefined
        const emoji = findEmojiMartEmojiByEmojiID(emojiData.data, status.status_user_emoji_id ?? "")?.skins[0].native
        return { emoji, text: status.status_user_emoji_desc }
    }, [status, expired, emojiData.data])

    const isBot = p?.is_bot === true
    const isExternal = isExternalUser(p)
    const isSelf = !!userUUID && userUUID === self.data?.data?.user_uuid
    const botCopy = botProfileCopy(p?.user_bot_kind)
    const kind: ProfileKind = isBot ? (p?.user_bot_kind === "agent" || p?.user_bot_kind === "assistant" ? "agent" : "bot") : isSelf ? "self" : "person"
    // By the one name rule; a bot made before bots took their name as
    // user_name has its login handle there, and goes by its full name.
    const name = (isBot && p?.user_full_name?.trim()) || displayNameOf(p)
    const handle = isBot ? "" : handleOf(p)
    const subtitle = isBot ? botCopy.subtitle : handle ? undefined : addressOrHandleOf(p) || undefined

    const close = () => {
        forgetHoverCard()
        setOpenState(false)
    }
    const go = (path: string) => {
        router.push(path)
        close()
    }

    const openPhoto = p?.user_profile_object_key
        ? () => {
              const media = {
                  attachment_uuid: p.user_profile_object_key,
                  attachment_file_name: `${name} profile image`,
                  attachment_type: "image",
                  attachment_size: 0,
                  attachment_created_at: new Date().toISOString(),
                  attachment_raw_type: "image/jpeg",
                  initial_url: imageSrc || "",
              } as AttachmentMediaReq
              dispatch(openUI({ key: "attachmentLightbox", data: { media, allMedia: [media], mediaGetUrl: GetEndpointUrl.PublicAttachmentURL } }))
          }
        : undefined

    const tags = (
        <>
            {p?.user_is_admin && !isBot ? <span className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-sunken px-1.5 text-micro font-medium text-ink-2">Admin</span> : null}
            {isExternal && !isBot ? <PrincipalTag kind="guest" /> : null}
            {isBot ? <BotTag userUUID={userUUID} /> : null}
        </>
    )

    let actions: React.ReactNode = null
    if (p) {
        if (kind === "self") {
            actions = (
                <>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => { close(); dispatch(openUI({ key: "selfUserProfile" })) }}>
                        <Pencil className="size-3.5" /> Edit profile
                    </Button>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => { close(); dispatch(openUI({ key: "userStatusUpdate", data: { userUUID } })) }}>
                        <Smile className="size-3.5" /> Set a status
                    </Button>
                </>
            )
        } else if (kind === "agent" || kind === "person") {
            // External contacts can't be messaged; the server refuses it too.
            if (!isExternal || isBot)
                actions = (
                    <Button size="sm" className="flex-1" onClick={() => go(`/app/chat/${userUUID}`)}>
                        <MessageSquare className="size-3.5" /> {isBot ? botCopy.action : "Message"}
                    </Button>
                )
        }
        // A bot that is no agent has nothing to message: no button at all.
    }

    let body: React.ReactNode = null
    if (p && kind === "agent") {
        body = <p className="text-ui-sm text-ink-2">{name} {botCopy.bio}</p>
    } else if (p && kind === "bot") {
        body = <p className="text-ui-sm text-ink-2">{name} {botCopy.bio}</p>
    } else if (p && isExternal) {
        body = (
            <>
                <p className="text-ui-sm text-ink-2">External contacts can&apos;t be messaged directly. Mention them in a task or comment to work together.</p>
                <InvitePlaceholder userUUID={userUUID} email={p.user_email_id} name={displayNameOf(p)} />
            </>
        )
    }

    const card = (
        <ProfileCard
            kind={kind}
            hueId={userUUID}
            name={name}
            handle={handle || undefined}
            subtitle={subtitle}
            photo={imageSrc || undefined}
            presence={isBot ? undefined : presence}
            tags={tags}
            state={kind === "agent" && p?.user_bot_kind === "agent" ? <AgentStatePill active={p?.user_status !== "paused"} /> : undefined}
            jobTitle={!isBot ? p?.user_job_title : undefined}
            status={statusShown}
            body={body}
            actions={actions}
            loading={!p}
            onPhoto={openPhoto}
            sheet={phone}
        />
    )

    if (phone) {
        return (
            <Drawer open={dialogOpenState} onOpenChange={(o) => !o && close()}>
                <DrawerContent data-profile-sheet="" className="p-0">
                    <DrawerTitle className="sr-only">{name || "Profile"}</DrawerTitle>
                    {card}
                </DrawerContent>
            </Drawer>
        )
    }

    // Without a recorded press (a deep link, a test), it opens near the top
    // of the screen, centred, as a popover still.
    const box = anchor ?? (typeof window !== "undefined" ? new DOMRect(window.innerWidth / 2, 96, 0, 0) : new DOMRect(0, 0, 0, 0))
    return (
        <Popover open={dialogOpenState} onOpenChange={(o) => !o && close()} modal={false}>
            <PopoverAnchor asChild>
                <span aria-hidden data-profile-anchor-box="" style={{ position: "fixed", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }} />
            </PopoverAnchor>
            <PopoverContent
                data-profile-popover=""
                {...hoverCardProps}
                // Opened by a hover, it must not take the focus from the page.
                onOpenAutoFocus={(e) => e.preventDefault()}
                side="bottom"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                aria-label={name ? `${name}'s profile` : "Profile"}
                className="hub-pop w-[320px] overflow-hidden rounded-xl bg-pop p-0 shadow-e3"
            >
                {card}
            </PopoverContent>
        </Popover>
    )
}

export default OtherProfileDialog
