"use client"

import { displayNameOf } from "@/lib/personName"
import {useState} from "react";
import {Input} from "@/components/ui/input";
import * as React from "react";
import MemberInfo from "@/components/member/memberInfo";
import {ListSkeleton} from "@/components/ui/ListSkeleton";
import {UserProfileDataInterface} from "@/types/user";
import { Search } from "@/lib/icons";


interface MembersListPropInterface {
    isAdmin: boolean
    usersList: UserProfileDataInterface[]
    isLoading?: boolean
    blockExitForUUID?: string
    handleMakeAdmin: (id: string) => void
    handleRemoveAdmin: (id: string) => void
    handleRemoveMember: (id: string) => void
    /** A row's control for what they may do (a project's roles), given whether it is the creator's. */
    renderRole?: (user: UserProfileDataInterface, isCreator: boolean) => React.ReactNode
}

/** How many people a list holds before it offers to find one among them. */
const FIND_FROM = 8

import { useDebounce } from "@/hooks/useDebounce";

const MembersList: React.FC<MembersListPropInterface> = ({isAdmin, blockExitForUUID, usersList, isLoading, handleMakeAdmin, handleRemoveAdmin, handleRemoveMember, renderRole}) => {

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 300)

    let foundSelf = false

    const filteredProject = React.useMemo(() => {
        return debouncedQuery === ''
            ? usersList
            : usersList.filter((member) =>
                displayNameOf(member)
                    .toLowerCase()
                    .replace(/\s+/g, '')
                    .includes(debouncedQuery.toLowerCase().replace(/\s+/g, ''))
            ) || []
    }, [debouncedQuery, usersList])

    return (
        <div className="flex-1 min-h-0 flex flex-col w-full">
            {/* A find for a long list only: three people under two "Search
                members…" fields, one adding and one filtering, read as one
                field twice (PTC-18). */}
            {usersList.length >= FIND_FROM && (
                <div className="relative mb-4 flex-shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Find a member…"
                        aria-label="Find a member"
                        className="pl-9 bg-muted/50 border-border/50 focus-visible:ring-primary/20"
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {isLoading ? (
                    <ListSkeleton className="px-0 py-2" />
                ) : usersList?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-primary/10 p-3 rounded-full mb-4">
                            <Search className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold">No members found</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                            Add members to collaborate on projects.
                        </p>
                    </div>
                ) : filteredProject?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm italic">
                        No members match your search.
                    </div>
                ) : (filteredProject.map((user) => {
                    let s = false
                    if(!foundSelf){
                        if( blockExitForUUID == user.user_uuid) {
                            foundSelf = true
                            s = true
                        }
                    }

                    return (
                        <div key={user.user_uuid} className="group transition duration-200">
                            <MemberInfo 
                                userInfo={user} 
                                isAdmin={isAdmin} 
                                handleRemoveMember={handleRemoveMember} 
                                handleMakeAdmin={handleMakeAdmin} 
                                handleRemoveAdmin={handleRemoveAdmin} 
                                blockedUUID={s}
                                roleControl={renderRole?.(user, s)}
                            />
                        </div>
                    )
                }))}
            </div>
        </div>
    );
};

export default MembersList;
