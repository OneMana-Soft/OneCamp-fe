"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxField, ComboboxInput, ComboboxList } from "@/components/ui/combobox"
import { UserComboboxItem } from "@/components/combobox/userComboboxItem"
import { useFetch } from "@/hooks/useFetch"
import { displayNameOf } from "@/lib/personName"
import type { UserListInterfaceResp } from "@/types/user"

interface AddMemberComboboxProps {
    /** Who can be added (those not in it yet). */
    url: string
    onAdd: (userUuid: string) => void | Promise<void>
    /** The filter's words, for who is offered ("Find someone in the team…"). */
    searchPlaceholder?: string
    empty?: string
    /** Inside a dialog or a sheet: the list draws in it, so it scrolls. */
    portalled?: boolean
}

/** Add someone to a project, a team or a channel: choose them, then Add member. */
export function AddMemberCombobox({ url, onAdd, searchPlaceholder = "Find someone…", empty = "Nobody by that name.", portalled = true }: AddMemberComboboxProps) {
    const [chosen, setChosen] = React.useState("")
    const people = useFetch<UserListInterfaceResp>(url)
    const users = people.data?.users ?? []
    const person = users.find((u) => u.user_uuid === chosen)

    const add = async () => {
        if (!chosen) return
        await onAdd(chosen)
        setChosen("")
        void people.mutate()
    }

    return (
        <div className="flex items-center gap-2">
            <Combobox>
                <ComboboxField aria-label="Person to add" placeholder="Add a person…" className="min-w-0 flex-1 sm:max-w-[16rem]">
                    {person ? displayNameOf(person) : undefined}
                </ComboboxField>
                <ComboboxContent label="People to add" portalled={portalled} selected={chosen || undefined}>
                    <ComboboxInput placeholder={searchPlaceholder} />
                    <ComboboxList>
                        <ComboboxEmpty>{people.isLoading ? "Loading people…" : empty}</ComboboxEmpty>
                        {users.map((user) => (
                            <UserComboboxItem
                                key={user.user_uuid}
                                userUuid={user.user_uuid}
                                userName={displayNameOf(user)}
                                userFullName={user.user_full_name}
                                userHandle={user.user_handle}
                                userEmail={user.user_email_id}
                                userProfileObjectKey={user.user_profile_object_key}
                                isBot={user.is_bot}
                                isSelected={chosen === user.user_uuid}
                                onSelect={(id) => setChosen(id === chosen ? "" : id)}
                            />
                        ))}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
            <Button className="h-11 shrink-0 md:h-8" onClick={() => void add()} disabled={!chosen}>
                Add member
            </Button>
        </div>
    )
}
