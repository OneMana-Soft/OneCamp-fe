"use client"

import {useState} from "react";
import {Input} from "@/components/ui/input";
import {Separator} from "@/components/ui/separator";
import * as React from "react";
import MemberInfo from "@/components/member/memberInfo";
import {ListSkeleton} from "@/components/ui/ListSkeleton";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import { Search } from "lucide-react";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";


interface MembersListPropInterface {
    isAdmin: boolean
    usersList: UserProfileDataInterface[]
    isLoading?: boolean
    blockExitForUUID?: string
    handleMakeAdmin: (id: string) => void
    handleRemoveAdmin: (id: string) => void
    handleRemoveMember: (id: string) => void
}

import { useDebounce } from "@/hooks/useDebounce";

const MembersList: React.FC<MembersListPropInterface> = ({isAdmin, blockExitForUUID, usersList, isLoading, handleMakeAdmin, handleRemoveAdmin, handleRemoveMember}) => {

    const [query, setQuery] = useState('')
    const debouncedQuery = useDebounce(query, 300)

    let foundSelf = false

    const filteredProject = React.useMemo(() => {
        return debouncedQuery === ''
            ? usersList
            : usersList.filter((member) =>
                member.user_name
                    .toLowerCase()
                    .replace(/\s+/g, '')
                    .includes(debouncedQuery.toLowerCase().replace(/\s+/g, ''))
            ) || []
    }, [debouncedQuery, usersList])

    return (
        <div className="flex-1 min-h-0 flex flex-col w-full">
            <div className="relative mb-4 flex-shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search members..."
                    className="pl-9 bg-muted/50 border-border/50 focus-visible:ring-primary/20"
                    onChange={(event) => setQuery(event.target.value)}
                />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {isLoading ? (
                    <ListSkeleton className="px-0 py-2" />
                ) : usersList?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="bg-primary/10 p-3 rounded-full mb-4">
                            <Search className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight">No members found</h3>
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
                        <div key={user.user_uuid} className="group transition-all duration-200">
                            <MemberInfo 
                                userInfo={user} 
                                isAdmin={isAdmin} 
                                handleRemoveMember={handleRemoveMember} 
                                handleMakeAdmin={handleMakeAdmin} 
                                handleRemoveAdmin={handleRemoveAdmin} 
                                blockedUUID={s}
                            />
                        </div>
                    )
                }))}
            </div>
        </div>
    );
};

export default MembersList;
