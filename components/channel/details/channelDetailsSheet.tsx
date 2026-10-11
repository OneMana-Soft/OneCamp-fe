"use client"

import * as React from "react"
import { useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useDispatch } from "react-redux"
import { useRouter } from "next/navigation"
import { SheetOverlay, SheetPortal } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotSearch } from "@/components/ui/graphics/spots"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { GuestLinkSection } from "@/components/guest/GuestLinkSection"
import AddChannelMemberCombobox from "@/components/combobox/addChannelMemberCombobox"
import { useChannelMembers } from "@/components/member/channelMemberContent"
import { MemberRow } from "@/components/channel/details/memberRow"
import { DetailsRow as Row, DetailsSection as Section } from "@/components/channel/details/detailsParts"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useDebounce } from "@/hooks/useDebounce"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { removeUserChannelName, updateUserChannelName } from "@/store/slice/userSlice"
import { displayNameOf } from "@/lib/personName"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { shortDate } from "@/lib/utils/date/shortDate"
import { app_channel_path } from "@/types/paths"
import { Hash, Lock, Megaphone, Search, X, Pencil } from "@/lib/icons"
import { NotificationType, type ChannelInfoInterfaceResp, type ChannelMemberUpdateInterface, type ChannelNotificationInterface } from "@/types/channel"
import type { UserProfileInterface } from "@/types/user"

interface ChannelDetailsSheetProps {
    channelId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface UpdateChannelPayload {
    channel_uuid: string
    channel_name: string
    channel_private: boolean
    channel_archived: boolean
    post_policy: "everyone" | "admins_only"
    channel_about?: string
}

/**
 * A destructive action that asks in place (C54): the button turns into the
 * question and its two answers, inside the card. No dialog over a sheet.
 */
function InlineConfirm({ label, question, warning, confirmLabel, onConfirm, busy, disabled, description }: {
    label: string
    question: string
    warning?: string
    confirmLabel: string
    onConfirm: () => void
    busy?: boolean
    disabled?: boolean
    description?: string
}) {
    const [asking, setAsking] = useState(false)
    if (!asking) {
        return (
            <Row label={label} description={description}>
                <Button variant="destructive" size="sm" disabled={disabled} onClick={() => setAsking(true)}>{label}</Button>
            </Row>
        )
    }
    return (
        <div role="group" aria-label={question} className="space-y-2 px-3 py-3 animate-fade-in">
            <p className="text-ui font-medium text-ink">{question}</p>
            {warning && <p className="text-meta text-warning-ink">{warning}</p>}
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAsking(false)} autoFocus>Cancel</Button>
                <Button variant="destructive" size="sm" aria-busy={busy || undefined} onClick={onConfirm}>{confirmLabel}</Button>
            </div>
        </div>
    )
}

const NOTIFY: { value: string; label: string; description: string }[] = [
    { value: NotificationType.NotificationAll, label: "Everything", description: "Every new message in this channel." },
    { value: NotificationType.NotificationMention, label: "Mentions and threads you're in", description: "Only when someone needs you." },
    { value: NotificationType.NotificationBlock, label: "Nothing", description: "Muted. It still shows unread in the sidebar." },
]

/**
 * A channel's details, on the right (design v3 chat, C49): one 440px sheet in
 * place of three surfaces (Edit channel, Channel members, and the phone's info
 * sheet). Sections as cards of rows: About, Members, Guests,
 * Notifications, Settings for admins, and the danger zone. Each setting saves
 * the moment it changes, so the sheet has no Save button to forget.
 */
export default function ChannelDetailsSheet({ channelId, open, onOpenChange }: ChannelDetailsSheetProps) {
    const dispatch = useDispatch()
    const router = useRouter()
    const basic = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : "")
    const { channelInfo: membersInfo, handleMakeAdmin, handleRemoveAdmin, handleAddMember, handleRemoveMember } = useChannelMembers(channelId)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfId = selfProfile.data?.data?.user_uuid
    const update = usePost()
    const notify = usePost()
    const leave = usePost()

    const info = basic.data?.channel_info
    const isAdmin = !!membersInfo.data?.channel_info.ch_is_admin || !!info?.ch_is_admin
    const isMember = membersInfo.data?.channel_info.ch_is_member ?? info?.ch_is_member
    const members = useMemo(() => membersInfo.data?.channel_info.ch_members ?? [], [membersInfo.data])
    const creatorId = info?.ch_created_by?.user_uuid ?? membersInfo.data?.channel_info.ch_created_by?.user_uuid
    const archived = !!info?.ch_deleted_at && !isZeroEpoch(info.ch_deleted_at)
    const announcement = info?.ch_post_policy === "admins_only"
    const name = info?.ch_name ?? ""

    const [query, setQuery] = useState("")
    const q = useDebounce(query, 200).toLowerCase().replace(/\s+/g, "")
    const shown = useMemo(() => (q ? members.filter((m) => displayNameOf(m).toLowerCase().replace(/\s+/g, "").includes(q)) : members), [members, q])
    const [adding, setAdding] = useState(false)

    const [editingTopic, setEditingTopic] = useState(false)
    const [topic, setTopic] = useState("")
    const [notification, setNotification] = useState<string | null>(null)
    const currentNotification = notification ?? info?.notification_type ?? NotificationType.NotificationAll

    // Every setting goes through the one UpdateChannel call with the rest of
    // the channel as it is, so changing one never resets another.
    const save = async (patch: Partial<UpdateChannelPayload>) => {
        if (!info) return
        const payload: UpdateChannelPayload = {
            channel_uuid: channelId,
            channel_name: info.ch_name,
            channel_private: info.ch_private,
            channel_archived: archived,
            post_policy: announcement ? "admins_only" : "everyone",
            ...patch,
        }
        basic.mutate({ ...basic.data!, channel_info: { ...info, ch_private: payload.channel_private, ch_post_policy: payload.post_policy, ch_about: payload.channel_about ?? info.ch_about } }, false)
        try {
            await update.makeRequest<UpdateChannelPayload>({ payload, apiEndpoint: PostEndpointUrl.UpdateChannel, showToast: true })
            if (payload.channel_archived) dispatch(removeUserChannelName({ channelUUID: channelId }))
            else dispatch(updateUserChannelName({ channelUUID: channelId, channelName: payload.channel_name, channelPrivate: payload.channel_private }))
            basic.mutate()
            return true
        } catch {
            basic.mutate()
            return false
        }
    }

    const saveTopic = async () => {
        setEditingTopic(false)
        if (topic.trim() === (info?.ch_about ?? "")) return
        await save({ channel_about: topic.trim() })
    }

    const changeNotification = async (next: string) => {
        const before = currentNotification
        setNotification(next)
        try {
            await notify.makeRequest<ChannelNotificationInterface>({ payload: { channel_id: channelId, notification_type: next }, apiEndpoint: PostEndpointUrl.UpdateChannelNotification })
        } catch {
            setNotification(before)
        }
    }

    const leaveChannel = async () => {
        if (!selfId) return
        try {
            await leave.makeRequest<ChannelMemberUpdateInterface>({ apiEndpoint: PostEndpointUrl.RemoveChannelMember, payload: { channel_id: channelId, user_id: selfId } })
            dispatch(removeUserChannelName({ channelUUID: channelId }))
            onOpenChange(false)
            router.push(app_channel_path)
        } catch {
            // usePost has said why.
        }
    }

    const archive = async () => {
        if (await save({ channel_archived: true })) {
            onOpenChange(false)
            router.push(app_channel_path)
        }
    }

    const createdBy = info?.ch_created_by ? displayNameOf(info.ch_created_by) : ""

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <SheetPortal>
                <SheetOverlay />
                <DialogPrimitive.Content
                    data-channel-details=""
                    aria-describedby={undefined}
                    // The sheet itself takes focus, not its close button: a ring on
                    // × the moment it opens read as the thing to press.
                    onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus() }}
                    tabIndex={-1}
                    className="fixed inset-y-0 right-0 z-[var(--z-modal)] flex w-full flex-col bg-sheet shadow-e4 outline-none animate-panel-in sm:w-[440px]"
                >
                    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                            {info?.ch_private ? <Lock className="size-4" /> : <Hash className="size-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <DialogPrimitive.Title className="truncate text-heading text-ink">{name || "Channel"}</DialogPrimitive.Title>
                            <p className="text-meta text-ink-3">
                                {members.length || info?.ch_member_count || 0} {(members.length || info?.ch_member_count) === 1 ? "member" : "members"}
                                {archived ? " · Archived" : ""}
                            </p>
                        </div>
                        <DialogPrimitive.Close asChild>
                            <Button variant="ghost" size="icon" aria-label="Close details"><X /></Button>
                        </DialogPrimitive.Close>
                    </header>

                    <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5">
                        <Section title="About">
                            {editingTopic ? (
                                <div className="space-y-2 px-3 py-3">
                                    <Label htmlFor="channel-topic" className="text-meta font-medium text-ink-2">Description</Label>
                                    <Input
                                        id="channel-topic"
                                        autoFocus
                                        value={topic}
                                        maxLength={250}
                                        onChange={(e) => setTopic(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); saveTopic() }
                                            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditingTopic(false) }
                                        }}
                                        placeholder="What this channel is for"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => setEditingTopic(false)}>Cancel</Button>
                                        <Button size="sm" onClick={saveTopic}>Save</Button>
                                    </div>
                                </div>
                            ) : (
                                <Row
                                    label="Description"
                                    description={info?.ch_about || (isAdmin ? "Say what this channel is for." : "No description yet.")}
                                >
                                    {isAdmin && (
                                        <Button variant="ghost" size="icon-sm" aria-label="Edit description" onClick={() => { setTopic(info?.ch_about ?? ""); setEditingTopic(true) }}>
                                            <Pencil />
                                        </Button>
                                    )}
                                </Row>
                            )}
                            {createdBy && (
                                <Row label="Created by" description={`${createdBy}${info?.ch_created_at ? ` on ${shortDate(new Date(info.ch_created_at))}` : ""}`} />
                            )}
                        </Section>

                        <Section
                            title={<>Members <span className="font-normal text-ink-3">· {members.length}</span></>}
                            action={(isAdmin || (isMember && !info?.ch_private)) && !archived ? (
                                <Button variant="secondary" size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
                                    Add people
                                </Button>
                            ) : undefined}
                        >
                            {adding && (
                                <div className="px-3 py-3">
                                    <AddChannelMemberCombobox handleAddMember={handleAddMember} channelId={channelId} />
                                </div>
                            )}
                            <div className="space-y-1 p-2">
                                {members.length > 6 && (
                                    <div className="relative px-1 pb-1">
                                        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-[calc(50%+2px)] text-ink-3" aria-hidden="true" />
                                        <Input
                                            type="search"
                                            aria-label="Search members"
                                            placeholder="Search members"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            className="pl-8 focus-visible:focus-halo"
                                        />
                                    </div>
                                )}
                                {membersInfo.isLoading ? (
                                    <ListSkeleton className="px-0 py-2" />
                                ) : shown.length === 0 ? (
                                    <EmptyState illustration={<SpotSearch />} title={q ? `No one called "${query}"` : "No members yet"} description={q ? "Try a first name, or add them." : undefined} className="py-8" />
                                ) : (
                                    shown.map((m) => (
                                        <MemberRow
                                            key={m.user_uuid}
                                            user={m}
                                            canManage={isAdmin}
                                            isSelf={m.user_uuid === selfId}
                                            isCreator={m.user_uuid === creatorId}
                                            onMakeAdmin={handleMakeAdmin}
                                            onRemoveAdmin={handleRemoveAdmin}
                                            onRemove={handleRemoveMember}
                                        />
                                    ))
                                )}
                            </div>
                        </Section>

                        {isAdmin && (
                            <Section title="Guests">
                                <div className="px-3 py-3">
                                    <GuestLinkSection resourceType="channel" resourceId={channelId} canShare embedded />
                                </div>
                            </Section>
                        )}

                        {isMember && (
                            <Section title="Notifications">
                                <RadioGroup value={currentNotification} onValueChange={changeNotification} aria-label="Notify me about" className="gap-0 divide-y divide-line">
                                    {NOTIFY.map((n) => (
                                        <label key={n.value} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-hover">
                                            <RadioGroupItem value={n.value} aria-label={n.label} />
                                            <span className="min-w-0">
                                                <span className="block text-ui font-medium text-ink">{n.label}</span>
                                                <span className="block text-meta text-ink-3">{n.description}</span>
                                            </span>
                                        </label>
                                    ))}
                                </RadioGroup>
                            </Section>
                        )}

                        {isAdmin && !archived && (
                            <Section title="Settings">
                                <Row icon={<Lock />} label="Private channel" description="Only invited members can find and join it." controlId="details-private">
                                    <Switch id="details-private" checked={!!info?.ch_private} disabled={!info} onCheckedChange={(v) => save({ channel_private: v })} />
                                </Row>
                                <Row icon={<Megaphone />} label="Announcement channel" description="Only admins post. Everyone can read, react and reply in threads." controlId="details-announcement">
                                    <Switch id="details-announcement" checked={announcement} disabled={!info} onCheckedChange={(v) => save({ post_policy: v ? "admins_only" : "everyone" })} />
                                </Row>
                            </Section>
                        )}

                        {isMember && (
                            <Section title="Danger zone" tone="danger">
                                <InlineConfirm
                                    label="Leave channel"
                                    description={creatorId === selfId ? "You made this channel, so you stay in it." : undefined}
                                    disabled={creatorId === selfId}
                                    question={`Leave #${name}?`}
                                    warning={info?.ch_private ? "You'll need an invite to come back." : undefined}
                                    confirmLabel="Leave"
                                    busy={leave.isSubmitting}
                                    onConfirm={leaveChannel}
                                />
                                {isAdmin && !archived && (
                                    <InlineConfirm
                                        label="Archive channel"
                                        description="Hides it and stops new messages. It can be restored."
                                        question={`Archive #${name}?`}
                                        warning="Nobody can post in it until it is restored."
                                        confirmLabel="Archive"
                                        busy={update.isSubmitting}
                                        onConfirm={archive}
                                    />
                                )}
                            </Section>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </SheetPortal>
        </DialogPrimitive.Root>
    )
}
