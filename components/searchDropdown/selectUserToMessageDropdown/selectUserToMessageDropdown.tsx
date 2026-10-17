"use client"

import { addressOrHandleOf, displayNameOf, matchesPerson, normalizePersonQuery } from "@/lib/personName"
import { Check, Search, X } from "@/lib/icons";
import {GetEndpointUrl} from "@/services/endPoints"
import {
    UserListInterfaceResp,
    UserProfileDataInterface,
} from "@/types/user"
import {Input} from "@/components/ui/input";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import type { UserProfileInterface } from "@/types/user";
import { BotTag } from "@/components/ui/botTag";
import {ChatUserListUserAvatar} from "@/components/chat/chatUserListUserAvatar";
import {cn} from "@/lib/utils/helpers/cn";

interface ForwardMessageDropdownProps {
    onSelect: (users: UserProfileDataInterface[]) => void
    placeholder?: string
}



export function SelectUserToMessageDropdown({
                                           onSelect,
                                           placeholder = "Search users…",
                                       }: ForwardMessageDropdownProps) {

    const [searchQuery, setSearchQuery] = useState("")
    const [selectedUsers, setSelectedUsers] = useState<UserProfileDataInterface[]>([])
    const onSelectRef = useRef(onSelect)
    const isInitialMount = useRef(true)

    useEffect(() => {
        onSelectRef.current = onSelect
    }, [onSelect])

    const usersList = useFetch<UserListInterfaceResp>(GetEndpointUrl.GetAllUser)

    // DM-able AI agent teammates (Req 10.1) — surfaced alongside people so a
    // member can start a 1:1 DM with a specialist agent the same way they DM a
    // colleague. The shared "OneCamp AI" coworker already comes through the
    // user list; these are the per-agent DM-able principals. Empty when AI is
    // off (no dangling affordance).
    const aiTargets = useFetch<{ data: UserProfileDataInterface[] }>(GetEndpointUrl.GetDMableAITargets)
    // The reader is in the list too, for notes to self: said so, and last,
    // never the first pick (QA F-47).
    const selfId = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid

    // People + DM-able AI teammates, AI first, de-duped by uuid (in case the
    // shared coworker is also present in the user list).
    const baseUsers = useMemo(() => {
        const humans = usersList.data?.users || []
        const ai = aiTargets.data?.data || []
        const seen = new Set(humans.map((u) => u.user_uuid))
        const extraAI = ai.filter((a) => a.user_uuid && !seen.has(a.user_uuid))
        const all = [...extraAI, ...humans]
        return selfId ? [...all.filter((u) => u.user_uuid !== selfId), ...all.filter((u) => u.user_uuid === selfId)] : all
    }, [usersList.data?.users, aiTargets.data?.data, selfId])

    // Memoize selected user UUIDs as Set for O(1) lookups
    const selectedUserUuids = useMemo(() => {
        return new Set(selectedUsers.map((u) => u.user_uuid))
    }, [selectedUsers])

    // Memoize search query processing
    const normalizedSearchQuery = useMemo(() => {
        return normalizePersonQuery(searchQuery)
    }, [searchQuery])

    const filteredUsers = useMemo(() => {
        if (!normalizedSearchQuery) return baseUsers

        return baseUsers.filter(
            (user) =>
                matchesPerson(user, normalizedSearchQuery, [user.user_email_id, user.user_job_title])
        )
    }, [normalizedSearchQuery, baseUsers])

    const handleSelect = useCallback((user: UserProfileDataInterface) => {
        setSelectedUsers((prev) => {
            const isSelected = prev.some((u) => u.user_uuid === user.user_uuid)
            if (isSelected) {
                return prev.filter((u) => u.user_uuid !== user.user_uuid)
            }
            return [...prev, user]
        })
    }, [])

    const isUserSelected = useCallback((userUuid: string) => {
        return selectedUserUuids.has(userUuid)
    }, [selectedUserUuids])

    const handleRemoveUser = useCallback((userUuid: string) => {
        setSelectedUsers((prev) => prev.filter((u) => u.user_uuid !== userUuid))
    }, [])

    useEffect(() => {
        // Skip initial mount call to avoid unnecessary parent updates
        if (isInitialMount.current) {
            isInitialMount.current = false
            return
        }
        onSelectRef.current(selectedUsers)
    }, [selectedUsers])

    // Design v3 rows (the chat row grammar, DESIGN_V3 §3.10/3.11): a person
    // is a 48px row with their face, name and handle, the hover overlay under
    // the pointer and the multi-select ground (--sel) with a checked box when
    // chosen. Each person was a bordered card, and a chosen one an accent
    // frame on a peach fill: the accent spent on selection, eight boxes in a
    // column. Who is chosen sits above as neutral chips with a ×.
    return (
        <div className="flex flex-col gap-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3"/>
                <Input
                    placeholder={placeholder}
                    aria-label="Search people"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                />
            </div>
            {selectedUsers.length > 0 && (
                <div data-picked="" className="flex flex-wrap gap-1.5">
                    {selectedUsers.map((user) => (
                        <span key={user.user_uuid} className="chip h-7 gap-1.5 rounded-full pl-1 pr-1 text-ink">
                            <ChatUserListUserAvatar
                                userProfileObjKey={user.user_profile_object_key}
                                userName={displayNameOf(user)}
                                userUUID={user.user_uuid}
                                isBot={!!user.is_bot}
                                size={20}
                            />
                            <span className="text-meta font-medium">{displayNameOf(user)}</span>
                            <button
                                type="button"
                                aria-label={`Remove ${displayNameOf(user)}`}
                                // 20px drawn, a finger's 44px to tap (app/phone.css F3).
                                data-touch-target=""
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleRemoveUser(user.user_uuid)
                                }}
                                className="flex size-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-press hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
                            >
                                <X className="size-3" aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div role="listbox" aria-label="People" aria-multiselectable="true" className="-mx-2 max-h-80 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                    <p className="px-2 py-6 text-center text-ui-sm text-ink-3">
                        {searchQuery.trim() ? `No one called \u201c${searchQuery.trim()}\u201d here` : "No one to message yet"}
                    </p>
                ) : (
                    filteredUsers.map((user) => {
                        const isSelected = isUserSelected(user.user_uuid)
                        const isSelf = user.user_uuid === selfId
                        const handle = addressOrHandleOf(user)
                        const second = isSelf ? "Notes to self" : user.user_job_title || handle
                        return (
                            <div
                                key={user.user_uuid}
                                role="option"
                                aria-selected={isSelected}
                                tabIndex={0}
                                data-person-row=""
                                onClick={() => handleSelect(user)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault()
                                        handleSelect(user)
                                    }
                                }}
                                className={cn(
                                    "flex h-12 cursor-pointer items-center gap-3 rounded-lg px-2 transition-colors duration-[140ms] ease-out",
                                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                                    isSelected ? "bg-sel" : "hover:bg-hover",
                                )}
                            >
                                <ChatUserListUserAvatar userProfileObjKey={user.user_profile_object_key} userName={displayNameOf(user)} userUUID={user.user_uuid} isBot={!!user.is_bot} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="truncate text-ui font-medium text-ink">{displayNameOf(user)}</span>
                                        {isSelf && <span className="shrink-0 text-meta text-ink-3">(you)</span>}
                                        {user.is_bot && <BotTag userUUID={user.user_uuid} />}
                                    </div>
                                    {second && (
                                        <p className="truncate text-meta text-ink-3">{second}</p>
                                    )}
                                </div>
                                {/* The v3 checkbox: 16px r5 on a line-3 ring, moss with a white check when chosen. */}
                                <span
                                    aria-hidden="true"
                                    data-check=""
                                    className={cn(
                                        "flex size-4 shrink-0 items-center justify-center rounded-[5px] transition-colors duration-[140ms]",
                                        isSelected ? "bg-camp-moss text-white" : "ring-[1.5px] ring-inset ring-line-3",
                                    )}
                                >
                                    {isSelected && <Check className="size-3" strokeWidth={2.5} />}
                                </span>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
