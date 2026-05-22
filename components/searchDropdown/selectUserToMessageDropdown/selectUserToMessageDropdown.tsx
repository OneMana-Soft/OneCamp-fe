"use client"

import { Check, Search, User, X } from "@/lib/icons";
import {GetEndpointUrl} from "@/services/endPoints"
import {
    UserListInterfaceResp,
    UserProfileDataInterface, UserProfileInterface,
} from "@/types/user"
import {Input} from "@/components/ui/input";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {Badge} from "@/components/ui/badge";
import {ChatUserListUserAvatar} from "@/components/chat/chatUserListUserAvatar";
import {cn} from "@/lib/utils/helpers/cn";

interface ForwardMessageDropdownProps {
    onSelect: (users: UserProfileDataInterface[]) => void
    placeholder?: string
}



export function SelectUserToMessageDropdown({
                                           onSelect,
                                           placeholder = "Search users...",
                                       }: ForwardMessageDropdownProps) {

    const [searchQuery, setSearchQuery] = useState("")
    const [selectedUsers, setSelectedUsers] = useState<UserProfileDataInterface[]>([])
    const onSelectRef = useRef(onSelect)
    const isInitialMount = useRef(true)

    useEffect(() => {
        onSelectRef.current = onSelect
    }, [onSelect])

    const usersList = useFetch<UserListInterfaceResp>(GetEndpointUrl.GetAllUser)

    // Memoize selected user UUIDs as Set for O(1) lookups
    const selectedUserUuids = useMemo(() => {
        return new Set(selectedUsers.map((u) => u.user_uuid))
    }, [selectedUsers])

    // Memoize search query processing
    const normalizedSearchQuery = useMemo(() => {
        return searchQuery.trim().toLowerCase()
    }, [searchQuery])

    const filteredUsers = useMemo(() => {
        if (!usersList.data?.users) return []

        if (!normalizedSearchQuery) return usersList.data.users

        return usersList.data.users.filter(
            (user) =>
                user.user_name.toLowerCase().includes(normalizedSearchQuery) ||
                user.user_email_id?.toLowerCase().includes(normalizedSearchQuery) ||
                user.user_job_title?.toLowerCase().includes(normalizedSearchQuery)
        )
    }, [normalizedSearchQuery, usersList.data?.users])

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

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4"/>
                <Input
                    placeholder={placeholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>
            {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-muted/50">
                    {selectedUsers.map((user) => (
                        <Badge
                            key={user.user_uuid}
                            variant="secondary"
                            className="flex items-center gap-1.5 pr-1 py-1"
                        >
                            <div className="h-5 w-5 rounded-full overflow-hidden flex-shrink-0 [&_*]:h-5 [&_*]:w-5">
                                <ChatUserListUserAvatar 
                                    userProfileObjKey={user.user_profile_object_key} 
                                    userName={user.user_name}
                                />
                            </div>
                            <span className="text-xs">{user.user_name}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleRemoveUser(user.user_uuid)
                                }}
                                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <div className="max-h-80 overflow-y-auto space-y-2">
                {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <User className="mx-auto h-12 w-12 mb-2 opacity-50"/>
                        <p>No users found</p>
                        <p className="text-sm">Try adjusting your search terms</p>
                    </div>
                ) : (
                    filteredUsers.map((user) => {
                        const isSelected = isUserSelected(user.user_uuid)
                        return (
                            <div
                                key={user.user_uuid}
                                onClick={() => handleSelect(user)}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                                    isSelected
                                        ? "bg-primary/10 border-primary"
                                        : "bg-card hover:bg-accent border-border"
                                )}
                            >
                                <ChatUserListUserAvatar userProfileObjKey={user.user_profile_object_key} userName={user.user_name} />


                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium text-sm text-foreground truncate">{user.user_name}</p>
                                        {isSelected &&
                                            <Check className="h-4 w-4 text-primary flex-shrink-0"/>}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate mb-1">{user.user_email_id}</p>
                                    <div className="flex gap-1">
                                        {user.user_job_title && <Badge variant="secondary" className="text-xs">
                                            {user.user_job_title}
                                        </Badge>}
                                        {/*<Badge variant="outline" className="text-xs">*/}
                                        {/*    {user.department}*/}
                                        {/*</Badge>*/}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

        </div>


    )
}
