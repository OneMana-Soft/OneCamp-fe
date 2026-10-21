"use client"

import * as React from "react"
import { PinnedSection } from "@/components/conversation/pins/PinnedSection"
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
import ChannelAITeammates from "@/components/member/channelAITeammates"
import ChannelAIBudget from "@/components/member/channelAIBudget"
import { useChannelMembers } from "@/components/member/channelMemberContent"
import { ChannelWeeklyReportSetting } from "@/components/ai/ChannelWeeklyReportSetting"
import { BroadcastSetting } from "@/components/channel/details/broadcastSetting"
import { MemberRow } from "@/components/channel/details/memberRow"
import { DetailsRow as Row, DetailsSection as Section, InlineConfirm } from "@/components/channel/details/detailsParts"
import { ChannelNameRow } from "@/components/channel/details/channelNameRow"
import { isComposingKey } from "@/lib/keys/ime"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { restoreChannel } from "@/services/channelService"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useDebounce } from "@/hooks/useDebounce"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { removeUserChannelName, updateUserChannelName } from "@/store/slice/userSlice"
import { useChannelNotification } from "@/hooks/useConversationNotification"
import { displayNameOf } from "@/lib/personName"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { shortDate } from "@/lib/utils/date/shortDate"
import { app_channel_path } from "@/types/paths"
import { Lock, Megaphone, Search, X, Pencil } from "@/lib/icons"
import { ChannelTile } from "@/components/ui/graphics/ChannelTile"
import { NotificationType, type ChannelInfoInterfaceResp, type ChannelMemberUpdateInterface } from "@/types/channel"
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
 * A channel's privacy. Making a private channel public opens its whole
 * history and files to everyone in the workspace, so only a workspace admin
 * may, after saying so in place; any of its moderators may make a public
 * channel private. A moderator who isn't a workspace admin sees a private
 * channel's privacy without a switch.
 */
function PrivacyRow({ name, isPrivate, workspaceAdmin, disabled, busy, onChange }: {
    name: string
    isPrivate: boolean
    workspaceAdmin: boolean
    disabled?: boolean
    busy?: boolean
    onChange: (makePrivate: boolean) => Promise<unknown> | void
}) {
    const [asking, setAsking] = useState(false)
    if (isPrivate && !workspaceAdmin) {
        return <Row icon={<Lock />} label="Private channel" description="Only invited members can find and join it. Only a workspace admin can make it public." />
    }
    if (asking) {
        const question = `Make #${name} public?`
        return (
            <div role="group" aria-label={question} className="space-y-2 px-3 py-3 animate-fade-in">
                <p className="text-ui font-medium text-ink">{question}</p>
                <p className="text-meta text-warning-ink">Everyone in the workspace will be able to find it and read its whole history, files included. A line in the channel will say you did.</p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setAsking(false)} autoFocus>Cancel</Button>
                    <Button variant="destructive" size="sm" aria-busy={busy || undefined} onClick={async () => { await onChange(false); setAsking(false) }}>Make public</Button>
                </div>
            </div>
        )
    }
    return (
        <Row icon={<Lock />} label="Private channel" description="Only invited members can find and join it." controlId="details-private">
            <Switch id="details-private" checked={isPrivate} disabled={disabled} onCheckedChange={(v) => (v ? onChange(true) : setAsking(true))} />
        </Row>
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
 * sheet). Sections as cards of rows: About, Members, Agents, Guests,
 * Notifications, Settings for admins, and the danger zone. Each setting saves
 * the moment it changes, so the sheet has no Save button to forget.
 */
export default function ChannelDetailsSheet({ channelId, open, onOpenChange }: ChannelDetailsSheetProps) {
    const dispatch = useDispatch()
    const router = useRouter()
    const { toast } = useToast()
    const basic = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : "")
    const { channelInfo: membersInfo, handleMakeAdmin, handleRemoveAdmin, handleAddMember, handleRemoveMember } = useChannelMembers(channelId)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfId = selfProfile.data?.data?.user_uuid
    const update = usePost()
    const leave = usePost()

    const info = basic.data?.channel_info
    const isAdmin = !!membersInfo.data?.channel_info.ch_is_admin || !!info?.ch_is_admin
    const isMember = membersInfo.data?.channel_info.ch_is_member ?? info?.ch_is_member
    const members = useMemo(() => membersInfo.data?.channel_info.ch_members ?? [], [membersInfo.data])
    const creatorId = info?.ch_created_by?.user_uuid ?? membersInfo.data?.channel_info.ch_created_by?.user_uuid
    const archived = !!info?.ch_deleted_at && !isZeroEpoch(info.ch_deleted_at)
    // An archived channel comes back by its admins or a workspace admin.
    const canRestore = archived && (isAdmin || !!selfProfile.data?.data?.user_is_admin)
    const [restoring, setRestoring] = useState(false)
    const announcement = info?.ch_post_policy === "admins_only"
    const name = info?.ch_name ?? ""

    const [query, setQuery] = useState("")
    const q = useDebounce(query, 200).toLowerCase().replace(/\s+/g, "")
    const shown = useMemo(() => (q ? members.filter((m) => displayNameOf(m).toLowerCase().replace(/\s+/g, "").includes(q)) : members), [members, q])
    // The list's count once it's there, the channel's own while it loads:
    // "Members · 0" sat over the loading rows for a second (QA F-19).
    const memberCount = membersInfo.isLoading ? info?.ch_member_count : members.length
    const [adding, setAdding] = useState(false)

    const [editingTopic, setEditingTopic] = useState(false)
    const [topic, setTopic] = useState("")
    const notification = useChannelNotification(channelId, info?.notification_type, name)

    // Every setting goes through the one UpdateChannel call with the rest of
    // the channel as it is, so changing one never resets another. Each says
    // what it did, or what didn't happen and why, in its own words: they all
    // said "Channel updated" or "Couldn't update channel" (QA F-35).
    const save = async (patch: Partial<UpdateChannelPayload>, words: { failed: string; done?: string }) => {
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
            await update.makeRequest<UpdateChannelPayload>({ payload, apiEndpoint: PostEndpointUrl.UpdateChannel, showErrorToast: true, failureTitle: words.failed })
            if (words.done) toast({ title: words.done })
            if (payload.channel_archived) dispatch(removeUserChannelName({ channelUUID: channelId }))
            else dispatch(updateUserChannelName({ channelUUID: channelId, channelName: payload.channel_name, channelPrivate: payload.channel_private }))
            basic.mutate()
            return true
        } catch {
            basic.mutate()
            return false
        }
    }

    const restore = async () => {
        setRestoring(true)
        try {
            await restoreChannel(channelId)
            toast({ title: `#${name} is back`, description: "Its members can post in it again." })
            basic.mutate()
        } catch (e) {
            toast({ title: `Couldn't restore #${name}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setRestoring(false)
        }
    }

    // The editor stays open with the draft until the description is saved: a
    // refusal closed it and lost what was typed (QA F-20).
    const saveTopic = async () => {
        const next = topic.trim()
        if (next === (info?.ch_about ?? "")) return setEditingTopic(false)
        if (await save({ channel_about: next }, { failed: "Couldn't save the description", done: "Description saved" })) setEditingTopic(false)
    }

    const leaveChannel = async () => {
        if (!selfId) return
        try {
            await leave.makeRequest<ChannelMemberUpdateInterface>({
                apiEndpoint: PostEndpointUrl.RemoveChannelMember,
                payload: { channel_id: channelId, user_id: selfId },
                showErrorToast: true,
                failureTitle: `Couldn't leave #${name}`,
            })
            dispatch(removeUserChannelName({ channelUUID: channelId }))
            onOpenChange(false)
            router.push(app_channel_path)
        } catch {
            // usePost has said why.
        }
    }

    // Archived says so in its own words, with the way back: it said "Channel
    // updated" (QA F-36).
    const archive = async () => {
        if (await save({ channel_archived: true }, { failed: `Couldn't archive #${name}` })) {
            onOpenChange(false)
            router.push(app_channel_path)
            toast({
                title: `#${name} archived`,
                description: "Nobody can post in it until it's restored.",
                action: <ToastAction altText={`Restore #${name}`} onClick={() => void restore()}>Restore</ToastAction>,
            })
        }
    }

    const createdBy = info?.ch_created_by ? displayNameOf(info.ch_created_by) : ""
    // The creator may leave, as anyone may, once someone else is an admin, so
    // the channel keeps one; the server holds to the same rule (QA F-46).
    const creatorStays = creatorId === selfId && !members.some((m) => m.user_is_admin && m.user_uuid !== selfId)

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
                        <ChannelTile id={channelId} isPrivate={!!info?.ch_private} size={32} />
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
                        {archived && (
                            <Section title="Archived">
                                <Row
                                    label="Restore channel"
                                    description={canRestore
                                        ? "Brings it back with its history, and its members can post again."
                                        : "Its admins and workspace admins can restore it."}
                                >
                                    {canRestore && (
                                        <Button variant="secondary" size="sm" onClick={() => void restore()} disabled={restoring} aria-busy={restoring || undefined}>
                                            {restoring ? "Restoring…" : "Restore"}
                                        </Button>
                                    )}
                                </Row>
                            </Section>
                        )}

                        <Section title="About">
                            <ChannelNameRow name={name} canRename={isAdmin && !archived} onRename={async (next) => (await save({ channel_name: next }, { failed: `Couldn't rename #${name}`, done: `Renamed to #${next}` })) === true} />
                            {editingTopic ? (
                                <div className="space-y-2 px-3 py-3">
                                    <Label htmlFor="channel-topic" className="text-meta font-medium text-ink-2">Description</Label>
                                    <Input
                                        id="channel-topic"
                                        data-escape-own=""
                                        autoFocus
                                        value={topic}
                                        maxLength={250}
                                        onChange={(e) => setTopic(e.target.value)}
                                        onKeyDown={(e) => {
                                            // An input method's Enter picks its word and its Escape drops it.
                                            if (isComposingKey(e.nativeEvent)) return
                                            if (e.key === "Enter") { e.preventDefault(); saveTopic() }
                                            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditingTopic(false) }
                                        }}
                                        placeholder="What this channel is for"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => setEditingTopic(false)}>Cancel</Button>
                                        <Button size="sm" onClick={saveTopic} disabled={update.isSubmitting} aria-busy={update.isSubmitting || undefined}>
                                            {update.isSubmitting ? "Saving…" : "Save"}
                                        </Button>
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

                        <PinnedSection
                            conversation={{ kind: "channel", id: channelId }}
                            onOpenMessage={(messageId) => {
                                onOpenChange(false)
                                router.push(`${app_channel_path}/${channelId}/${messageId}`)
                            }}
                        />

                        <Section
                            title={<>Members{memberCount === undefined ? null : <> <span className="font-normal text-ink-3">· {memberCount}</span></>}</>}
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

                        {(isAdmin || (isMember && !info?.ch_private)) && (
                            // The workspace's agents that answer here, and the channel's
                            // AI settings: sections of their own with sentence-case
                            // titles, like the rest. Each hides itself when it has
                            // nothing (an edition without AI).
                            <>
                                <ChannelAITeammates channelId={channelId} />
                                <ChannelAIBudget channelId={channelId} />
                            </>
                        )}

                        {isAdmin && (
                            <Section title="Guests">
                                <div className="px-3 py-3">
                                    <GuestLinkSection resourceType="channel" resourceId={channelId} canShare embedded />
                                </div>
                            </Section>
                        )}

                        {isMember && (
                            <Section title="Notifications">
                                <RadioGroup value={notification.level} onValueChange={notification.choose} aria-label="Notify me about" className="gap-0 divide-y divide-line">
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
                                <PrivacyRow
                                    name={name}
                                    isPrivate={!!info?.ch_private}
                                    workspaceAdmin={!!selfProfile.data?.data?.user_is_admin}
                                    disabled={!info}
                                    busy={update.isSubmitting}
                                    onChange={(makePrivate) => save(
                                        { channel_private: makePrivate },
                                        makePrivate
                                            ? { failed: `Couldn't make #${name} private`, done: `#${name} is private now` }
                                            : { failed: `Couldn't make #${name} public`, done: `#${name} is public now` },
                                    )}
                                />
                                <Row icon={<Megaphone />} label="Announcement channel" description="Only admins post. Everyone can read, react and reply in threads." controlId="details-announcement">
                                    <Switch
                                        id="details-announcement"
                                        checked={announcement}
                                        disabled={!info}
                                        onCheckedChange={(v) => save(
                                            { post_policy: v ? "admins_only" : "everyone" },
                                            { failed: `Couldn't change who can post in #${name}`, done: v ? `Only admins post in #${name} now` : `Everyone can post in #${name} again` },
                                        )}
                                    />
                                </Row>
                                <BroadcastSetting channelId={channelId} />
                                <ChannelWeeklyReportSetting channelUUID={channelId} />
                            </Section>
                        )}

                        {isMember && (
                            <Section title="Danger zone" tone="danger">
                                <InlineConfirm
                                    label="Leave channel"
                                    description={creatorStays ? "You made this channel. Make someone else an admin to leave it." : undefined}
                                    disabled={creatorStays}
                                    question={`Leave #${name}?`}
                                    warning={info?.ch_private ? "You'll need an invite to come back." : undefined}
                                    confirmLabel="Leave"
                                    busy={leave.isSubmitting}
                                    onConfirm={leaveChannel}
                                />
                                {isAdmin && !archived && (
                                    <InlineConfirm
                                        label="Archive channel"
                                        description="Stops new messages and moves it to Archived; its members still find its history in search. Its admins and workspace admins can restore it."
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
