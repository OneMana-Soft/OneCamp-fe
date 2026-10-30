"use client"

import { useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useDispatch, useStore } from "react-redux"
import { usePathname, useRouter } from "next/navigation"
import { SheetOverlay, SheetPortal } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { ToastAction } from "@/components/ui/toast"
import { BotTag } from "@/components/ui/botTag"
import { ChatFace } from "@/components/message/chatFace"
import { DetailsRow as Row, DetailsSection as Section, InlineConfirm } from "@/components/channel/details/detailsParts"
import { AddPeoplePanel } from "@/components/conversation/details/addPeoplePanel"
import { PinnedSection } from "@/components/conversation/pins/PinnedSection"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { useChannelNameCheck } from "@/hooks/useChannelNameCheck"
import { appMutate } from "@/lib/swrMutate"
import { fieldKeyDown } from "@/lib/keys/ime"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { channelSlug, nameProblem } from "@/lib/validation/names"
import { chatPath } from "@/lib/routes/conversationRoute"
import { chatRef } from "@/lib/conversation/route"
import { leaveGroup, makePrivateChannel, renameGroup, setHidden, type ChatPlace, type Opened } from "@/lib/conversation/conversationApi"
import { GetEndpointUrl } from "@/services/endPoints"
import { hideSidebarChat, nameSidebarChat } from "@/lib/conversation/sidebarChats"
import { CreateUserChatList } from "@/store/slice/chatSlice"
import { app_channel_path, app_chat_path, app_grp_chat_path } from "@/types/paths"
import { EyeOff, Lock, Pencil, Users, X } from "@/lib/icons"
import { focusDialogItself } from "@/components/ui/overlayFocus"
import type { RootState } from "@/store/store"
import type { RawUserDMInterface, UserProfileDataInterface, UserProfileInterface } from "@/types/user"

/** The longest a group's name may be, as the server holds it (business/Conversation maxGroupName). */
const MAX_GROUP_NAME = 80

/** The fewest people a group keeps (business/Conversation minGroupPeople): one of three isn't left. */
const MIN_GROUP_PEOPLE = 3

/**
 * A DM's or group's details, on the right (chat A9), as a channel's are
 * (components/channel/details): its name (a group's, which any of its people
 * may set), its people and Add people, then making it a private channel,
 * hiding it, and leaving a group. Each change happens the moment it's made
 * and says so.
 */
export default function ConversationDetailsSheet({ place, adding = false, open, onOpenChange }: {
    place: ChatPlace
    /** Opens on Add people. */
    adding?: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
}) {
    const dispatch = useDispatch()
    const store = useStore<RootState>()
    const router = useRouter()
    const pathname = usePathname()
    const { toast } = useToast()
    const peopleKey = `${GetEndpointUrl.GetDmGroupParticipants}/${encodeURIComponent(place.id)}`
    const info = useFetch<RawUserDMInterface>(place.id ? peopleKey : "")
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    // The conversation its pins are of (chat B25): a DM's names the person beside the reader.
    const pinsOf = useMemo(() => chatRef(place.id, self), [place.id, self])
    const people = useMemo(() => info.data?.data?.dm_participants ?? [], [info.data])
    const others = people.filter((p) => p.user_uuid !== self)
    const name = info.data?.data?.dm_name ?? ""
    const title = place.kind === "group" ? name || others.map((p) => displayNameOf(p)).join(", ") || "Group" : displayNameOf(others[0]) || "Conversation"

    const [addingOpen, setAddingOpen] = useState(adding)
    const [leaving, setLeaving] = useState(false)
    const [channelPeople, setChannelPeople] = useState<UserProfileDataInterface[] | null>(null)

    const close = () => onOpenChange(false)

    const added = (opened: Opened) => {
        close()
        router.push(`${app_grp_chat_path}/${opened.id}`)
        const sharing = opened.sharing ? ` Sharing ${opened.sharing.toLocaleString("en-GB")} earlier ${opened.sharing === 1 ? "message" : "messages"} with them.` : ""
        toast(opened.existed
            ? { title: "There's a group of exactly these people already", description: `It's open now.${sharing}` }
            : { title: "Group started", description: sharing.trim() || "They'll see what's said from now on." })
    }

    const rename = async (next: string) => {
        try {
            await renameGroup(place.id, next)
            nameSidebarChat(dispatch, store.getState().users.userSidebar.userChats, place.id, next)
            void info.mutate()
            toast({ title: next ? `Named “${next}”` : "Name taken away" })
            return true
        } catch (e) {
            toast({ title: "The name wasn't saved", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
            return false
        }
    }

    const made = (opened: Opened, channelName: string) => {
        close()
        router.push(`${app_channel_path}/${opened.id}`)
        toast({ title: `#${channelName} is ready`, description: opened.sharing ? "This conversation's history is on its way there." : "This conversation stays, with a line saying where it went." })
    }

    // Out of the sidebar and the chat list, and away from the conversation
    // when it is open: hiding it and leaving it both do this.
    const dropFromSidebar = () => {
        hideSidebarChat(dispatch, store.getState().users.userSidebar.userChats, place.id)
        const list = store.getState().chat.latestChatList || []
        dispatch(CreateUserChatList({ userDmList: list.filter((d) => d.dm_grouping_id !== place.id) }))
        close()
        const here = chatPath(place.id, self)
        if (here && pathname?.startsWith(here)) router.push(app_chat_path)
    }

    const leave = async () => {
        if (leaving) return
        setLeaving(true)
        try {
            await leaveGroup(place.id)
        } catch (e) {
            toast({ title: "You're still in the conversation", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
            return
        } finally {
            setLeaving(false)
        }
        dropFromSidebar()
        toast({ title: "You left the conversation", description: "Its messages won't reach you any more." })
    }

    const hide = async () => {
        try {
            await setHidden(place, true)
        } catch (e) {
            toast({ title: "It wasn't hidden", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
            return
        }
        dropFromSidebar()
        toast({
            title: "Conversation hidden",
            description: "It comes back when someone writes in it.",
            action: <ToastAction altText="Show it again" onClick={() => void unhide()}>Undo</ToastAction>,
        })
    }
    const unhide = async () => {
        try {
            await setHidden(place, false)
            void appMutate(GetEndpointUrl.SelfProfileSideNav)
            void appMutate(GetEndpointUrl.GetUserLatestChatList)
        } catch (e) {
            toast({ title: "It's still hidden", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        }
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <SheetPortal>
                <SheetOverlay />
                <DialogPrimitive.Content
                    data-conversation-details=""
                    aria-describedby={undefined}
                    onOpenAutoFocus={focusDialogItself}
                    tabIndex={-1}
                    className="fixed inset-y-0 right-0 z-[var(--z-modal)] flex w-full flex-col bg-sheet shadow-e4 outline-none animate-panel-in sm:w-[440px]"
                >
                    <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2">
                            <Users className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <DialogPrimitive.Title className="truncate text-heading text-ink">{title}</DialogPrimitive.Title>
                            <p className="text-meta text-ink-3">{people.length ? `${people.length} ${people.length === 1 ? "person" : "people"}` : place.kind === "group" ? "Group" : "Direct message"}</p>
                        </div>
                        <DialogPrimitive.Close asChild>
                            <Button variant="ghost" size="icon" aria-label="Close details"><X /></Button>
                        </DialogPrimitive.Close>
                    </header>

                    <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5">
                        {place.kind === "group" && (
                            <Section title="About">
                                <GroupNameRow name={name} onRename={rename} />
                            </Section>
                        )}

                        {pinsOf && (
                            <PinnedSection
                                conversation={pinsOf}
                                onOpenMessage={(messageId) => {
                                    const to = chatPath(place.id, self, messageId)
                                    onOpenChange(false)
                                    if (to) router.push(to)
                                }}
                            />
                        )}

                        <Section
                            title={<>People{people.length ? <> <span className="font-normal text-ink-3">· {people.length}</span></> : null}</>}
                            action={!addingOpen ? <Button variant="secondary" size="sm" onClick={() => setAddingOpen(true)}>Add people</Button> : undefined}
                        >
                            {addingOpen && (
                                <AddPeoplePanel
                                    place={place}
                                    present={people}
                                    onAdded={added}
                                    onCancel={() => setAddingOpen(false)}
                                    onPrivateChannel={(chosen) => setChannelPeople(chosen)}
                                />
                            )}
                            <div className="space-y-1 p-2">
                                {info.isLoading && !people.length ? (
                                    <ListSkeleton className="px-0 py-2" />
                                ) : (
                                    people.map((p) => <PersonRow key={p.user_uuid} user={p} isSelf={p.user_uuid === self} />)
                                )}
                            </div>
                        </Section>

                        <Section title="More">
                            <PrivateChannelRow
                                place={place}
                                people={channelPeople}
                                open={channelPeople !== null}
                                onOpen={() => setChannelPeople([])}
                                onCancel={() => setChannelPeople(null)}
                                onMade={made}
                            />
                            <Row icon={<EyeOff />} label="Hide conversation" description="Takes it out of your sidebar until someone writes in it again.">
                                <Button variant="secondary" size="sm" onClick={() => void hide()}>Hide</Button>
                            </Row>
                        </Section>

                        {place.kind === "group" && (
                            <Section title="Danger zone" tone="danger">
                                <InlineConfirm
                                    label="Leave conversation"
                                    description={people.length > 0 && people.length <= MIN_GROUP_PEOPLE
                                        ? "A group needs at least three people. Hide it instead, or make it a private channel."
                                        : "Its messages and notifications stop reaching you."}
                                    disabled={people.length <= MIN_GROUP_PEOPLE}
                                    question="Leave this conversation?"
                                    warning="To come back, someone starts a group with all of you again."
                                    confirmLabel="Leave"
                                    busy={leaving}
                                    onConfirm={() => void leave()}
                                />
                            </Section>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </SheetPortal>
        </DialogPrimitive.Root>
    )
}

/** One of its people: their face, name and address, "you" for the reader. */
function PersonRow({ user, isSelf }: { user: UserProfileDataInterface; isSelf: boolean }) {
    const name = displayNameOf(user)
    const second = user.is_bot ? "" : addressOrHandleOf(user)
    return (
        <div data-person-row="" className="flex min-h-12 items-center gap-3 rounded-lg px-2">
            <ChatFace name={name} profileKey={user.user_profile_object_key} userUUID={user.user_uuid} isBot={!!user.is_bot} size={32} />
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-ui font-medium text-ink">{name}</span>
                    {user.is_bot && <BotTag userUUID={user.user_uuid} />}
                    {isSelf && <span className="text-meta text-ink-3">you</span>}
                </div>
                {second && <p className="truncate text-meta text-ink-3">{second}</p>}
            </div>
        </div>
    )
}

/** A group's name: shown, and set or taken away in place by any of its people. */
function GroupNameRow({ name, onRename }: { name: string; onRename: (next: string) => Promise<boolean> }) {
    const [editing, setEditing] = useState(false)
    const [value, setValue] = useState(name)
    const [saving, setSaving] = useState(false)
    const next = value.trim().replace(/\s+/g, " ")
    const problem = [...next].length > MAX_GROUP_NAME ? `A name can be at most ${MAX_GROUP_NAME} characters.` : /\p{Cc}/u.test(next) ? "A name can't hold that character." : ""

    const cancel = () => {
        setEditing(false)
        setValue(name)
    }
    const submit = async () => {
        if (next === name) return cancel()
        if (problem || saving) return
        setSaving(true)
        const ok = await onRename(next)
        setSaving(false)
        if (ok) setEditing(false)
    }

    if (!editing) {
        return (
            <Row label="Name" description={name || "No name yet: its people's names stand for it."}>
                <Button variant="ghost" size="icon-sm" aria-label={name ? "Rename group" : "Name group"} onClick={() => { setValue(name); setEditing(true) }}>
                    <Pencil />
                </Button>
            </Row>
        )
    }
    return (
        <div className="space-y-2 px-3 py-3">
            <Label htmlFor="group-name" className="text-meta font-medium text-ink-2">Name</Label>
            <Input
                id="group-name"
                data-escape-own=""
                autoFocus
                value={value}
                maxLength={MAX_GROUP_NAME + 20}
                placeholder="Name this group"
                aria-invalid={!!problem || undefined}
                aria-describedby="group-name-hint"
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={fieldKeyDown((e) => {
                    if (e.key === "Enter") { e.preventDefault(); void submit() }
                    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel() }
                })}
            />
            <p id="group-name-hint" aria-live="polite" className={problem ? "text-meta text-danger-ink" : "text-meta text-ink-3"}>
                {problem || (next ? "Everyone in the group sees it." : name ? "Saving with no name takes the name away." : "")}
            </p>
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
                <Button size="sm" onClick={() => void submit()} disabled={!!problem} busy={saving}>
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    )
}

/**
 * Make a private channel: everyone here (and anyone chosen in Add people) in
 * a new private channel, its maker its admin. This conversation stays, with a
 * line saying where it went; its history goes along only when asked.
 */
function PrivateChannelRow({ place, people, open, onOpen, onCancel, onMade }: {
    place: ChatPlace
    /** People chosen in Add people to bring along too. */
    people: UserProfileDataInterface[] | null
    open: boolean
    onOpen: () => void
    onCancel: () => void
    onMade: (opened: Opened, name: string) => void
}) {
    const [value, setValue] = useState("")
    const [history, setHistory] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const next = value.trim()
    const problem = next ? nameProblem("workspace", "Channel name", value) : ""
    const { taken, free } = useChannelNameCheck(open && next && !problem ? next : "")

    if (!open) {
        return (
            <Row icon={<Lock />} label="Make a private channel" description="Carry on in a private channel with everyone here. This conversation stays as it is.">
                <Button variant="secondary" size="sm" onClick={onOpen}>Make channel</Button>
            </Row>
        )
    }
    const submit = async () => {
        if (!next || problem || taken || busy) return
        setBusy(true)
        setError("")
        try {
            const opened = await makePrivateChannel(place, next, history, (people ?? []).map((p) => p.user_uuid))
            onMade(opened, next)
        } catch (e) {
            setError(apiErrorMessage(e, "The channel wasn't made. Try again in a moment."))
        } finally {
            setBusy(false)
        }
    }
    const hint = problem || (taken ? `#${next} is taken. Try another name.` : free ? `#${next} is free.` : "")
    return (
        <div data-private-channel="" className="space-y-3 px-3 py-3">
            <div className="space-y-2">
                <Label htmlFor="private-channel-name" className="text-meta font-medium text-ink-2">Channel name</Label>
                <Input
                    id="private-channel-name"
                    data-escape-own=""
                    autoFocus
                    value={value}
                    maxLength={40}
                    placeholder="e.g. launch-plan"
                    aria-invalid={!!problem || taken || undefined}
                    aria-describedby="private-channel-hint"
                    onChange={(e) => setValue(channelSlug(e.target.value))}
                    onKeyDown={fieldKeyDown((e) => {
                        if (e.key === "Enter") { e.preventDefault(); void submit() }
                        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel() }
                    })}
                />
                <p id="private-channel-hint" aria-live="polite" className={problem || taken ? "text-meta text-danger-ink" : "text-meta text-ink-3"}>{hint}</p>
            </div>
            {!!people?.length && (
                <p className="text-meta text-ink-2">With {people.map((p) => displayNameOf(p)).join(", ")} too.</p>
            )}
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor="private-channel-history" className="text-ui text-ink">Bring this conversation&apos;s history</Label>
                <Switch id="private-channel-history" checked={history} onCheckedChange={setHistory} />
            </div>
            {error && <p role="alert" className="text-meta text-danger-ink">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={() => void submit()} disabled={!next || !!problem || taken} busy={busy}>
                    {busy ? "Making it…" : "Make channel"}
                </Button>
            </div>
        </div>
    )
}
