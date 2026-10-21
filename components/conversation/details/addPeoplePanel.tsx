"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "@/components/ui/command"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { UserComboboxItem } from "@/components/combobox/userComboboxItem"
import { useFetch } from "@/hooks/useFetch"
import { ChatGet } from "@/services/endpoints/chat"
import { displayNameOf } from "@/lib/personName"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { addPeople, shareChoicesKey, type ChatPlace, type Opened, type Share, type ShareChoice } from "@/lib/conversation/conversationApi"
import { shareOptions } from "@/components/conversation/details/shareOptions"
import { ChevronsUpDown, X } from "@/lib/icons"
import type { UserListInterfaceResp, UserProfileDataInterface } from "@/types/user"

/** How many people one Add takes, as the server does (business/Conversation maxAdded). */
const MAX_ADDED = 50
/** From this many people, a private channel is offered first. */
const CHANNEL_FROM = 9

/**
 * Add people (chat A9, D-S1): who joins, and how much of what was said here
 * they get. A group is a fixed set of people, so adding someone opens the
 * group of everyone (or the one there is for exactly them) and this
 * conversation stays as it is, with a line saying where it continues.
 * "Share earlier messages?" starts on "No, start fresh"; the last day, the
 * last 7 days and everything each say what they'd share. From nine people a
 * private channel is offered first.
 */
export function AddPeoplePanel({ place, present, onAdded, onCancel, onPrivateChannel }: {
    place: ChatPlace
    /** The people in it now. */
    present: UserProfileDataInterface[]
    onAdded: (opened: Opened, added: UserProfileDataInterface[]) => void
    onCancel: () => void
    /** "Make a private channel instead", with the people chosen. */
    onPrivateChannel: (chosen: UserProfileDataInterface[]) => void
}) {
    const [chosen, setChosen] = useState<UserProfileDataInterface[]>([])
    const [share, setShare] = useState<Share>("none")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const choices = useFetch<{ data: ShareChoice[] }>(chosen.length ? shareChoicesKey(place) : "")
    const options = useMemo(() => shareOptions(choices.data?.data), [choices.data])
    const total = present.length + chosen.length

    const toggle = (user: UserProfileDataInterface) => {
        setError("")
        setChosen((c) => (c.some((u) => u.user_uuid === user.user_uuid) ? c.filter((u) => u.user_uuid !== user.user_uuid) : c.length >= MAX_ADDED ? c : [...c, user]))
    }

    const submit = async () => {
        if (!chosen.length || busy) return
        setBusy(true)
        setError("")
        try {
            const opened = await addPeople(place, chosen.map((u) => u.user_uuid), share)
            onAdded(opened, chosen)
        } catch (e) {
            setError(apiErrorMessage(e, "They weren't added. Try again in a moment."))
        } finally {
            setBusy(false)
        }
    }

    const addLabel = chosen.length === 0 ? "Add people" : chosen.length === 1 ? "Add 1 person" : `Add ${chosen.length} people`
    return (
        <div data-add-people="" className="space-y-3 px-3 py-3">
            <PeoplePicker place={place} chosen={chosen} onToggle={toggle} />
            {chosen.length > 0 && (
                <ul aria-label="People to add" className="flex flex-wrap gap-1.5">
                    {chosen.map((u) => (
                        <li key={u.user_uuid} className="chip min-w-0 pr-0.5">
                            <span className="truncate">{displayNameOf(u)}</span>
                            <Button variant="ghost" size="icon-xs" aria-label={`Don't add ${displayNameOf(u)}`} onClick={() => toggle(u)} className="size-5 shrink-0">
                                <X className="size-3" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            {chosen.length > 0 && (
                <fieldset className="space-y-1.5">
                    <legend className="pb-1 text-meta font-medium text-ink-2">Share earlier messages?</legend>
                    <RadioGroup value={share} onValueChange={(v) => setShare(v as Share)} aria-label="Share earlier messages" className="gap-0 divide-y divide-line rounded-lg border border-line">
                        {options.map((o) => (
                            <label key={o.share} data-share-choice={o.share} data-interactive="row" aria-disabled={o.empty || undefined} className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 aria-disabled:cursor-not-allowed">
                                <RadioGroupItem value={o.share} disabled={o.empty} aria-label={o.label} />
                                <span className="min-w-0">
                                    <span className="block text-ui font-medium text-ink">{o.label}</span>
                                    {o.description && <span className="block text-meta text-ink-3">{o.description}</span>}
                                </span>
                            </label>
                        ))}
                    </RadioGroup>
                    {choices.isError && !choices.data && <p className="text-meta text-ink-3">The counts didn&apos;t load. You can still choose.</p>}
                </fieldset>
            )}
            {total >= CHANNEL_FROM && (
                <div data-channel-offer="" className="space-y-2 rounded-lg bg-sunken px-3 py-2.5">
                    <p className="text-meta text-ink-2">That&apos;s {total} people. A private channel may suit them better: it has a name, and people can join and leave it.</p>
                    <Button variant="secondary" size="sm" onClick={() => onPrivateChannel(chosen)}>Make a private channel instead</Button>
                </div>
            )}
            {error && <p role="alert" className="text-meta text-danger-ink">{error}</p>}
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={() => void submit()} disabled={!chosen.length || busy} aria-busy={busy || undefined}>
                    {busy ? "Adding…" : addLabel}
                </Button>
            </div>
        </div>
    )
}

/** Who to add: everyone who isn't here, searched by name, handle or address; picking one again takes them off. */
function PeoplePicker({ place, chosen, onToggle }: {
    place: ChatPlace
    chosen: UserProfileDataInterface[]
    onToggle: (user: UserProfileDataInterface) => void
}) {
    const [open, setOpen] = useState(false)
    const users = useFetch<UserListInterfaceResp>(`${ChatGet.UserListNotBelongToDm}/${encodeURIComponent(place.id)}`)
    const picked = useMemo(() => new Set(chosen.map((u) => u.user_uuid)), [chosen])
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
                    <span className="truncate text-ink-2">{chosen.length ? "Choose someone else" : "Choose people"}</span>
                    <ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
                </Button>
            </PopoverTrigger>
            <PopoverContent portalled={false} align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command>
                    <CommandInput placeholder="Search people" />
                    <CommandList>
                        <CommandEmpty>{users.isLoading ? "Loading people…" : "Nobody else to add"}</CommandEmpty>
                        <CommandGroup>
                            {(users.data?.users ?? []).map((user) => (
                                <UserComboboxItem
                                    key={user.user_uuid}
                                    userUuid={user.user_uuid}
                                    userName={displayNameOf(user)}
                                    userFullName={user.user_full_name}
                                    userHandle={user.user_handle}
                                    userEmail={user.user_email_id}
                                    userProfileObjectKey={user.user_profile_object_key}
                                    isSelected={picked.has(user.user_uuid)}
                                    isBot={user.is_bot}
                                    onSelect={() => onToggle(user)}
                                />
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
