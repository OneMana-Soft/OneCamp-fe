"use client"

import { Hash, Users } from "lucide-react"
import { PostEndpointUrl } from "@/services/endPoints"
import { usePost } from "@/hooks/usePost"
import type { ChannelAndUserListInterfaceReq, ChannelAndUserListInterfaceResp } from "@/types/user"
import {SearchableItem} from "@/types/search";
import {FwdMsgToProfileAvatar} from "@/components/searchDropdown/fwdMsgToDropdown/fwdMsgToProfileAvatar";
import {MultiSelectSearch} from "@/components/multiSelectSearch/multiSelectSearch";

interface ForwardMessageDropdownProps {
    onSelect?: (users: ChannelAndUserListInterfaceResp[]) => void
    placeholder?: string
    maxItems?: number
    className?: string
}

// Create a proper interface that extends SearchableItem without conflicts
interface ForwardMessageSearchItem extends SearchableItem {
    user_profile_object_key?: string
    user_uuid?: string
    user_dgraph_uid?: string
    channel_uuid?: string
    channel_dgraph_uid?: string
    user_name?: string
    channel_name?: string
    grp_id?: string
    grp_dgraph_uid?: string
    grp_name?: string
}

export function ForwardMessageDropdown({
                                           onSelect,
                                           placeholder = "Search users, channels or groups...",
                                           maxItems,
                                           className,
                                       }: ForwardMessageDropdownProps) {
    const { makeRequest } = usePost()

    async function handleSearch(query: string): Promise<ForwardMessageSearchItem[]> {
        if (!query.trim()) return []

        try {
            const response = await makeRequest<ChannelAndUserListInterfaceReq, ChannelAndUserListInterfaceResp[]>({
                apiEndpoint: PostEndpointUrl.SearchUserAndChannel,
                payload: { search_text: query },
            })

            if (!response) return []

            return response.map((item) => ({
                id: item.user_uuid || item.channel_uuid || item.grp_id || "",
                name: item.user_name || item.channel_name || item.grp_name || "",
                type: item.user_uuid ? "user" : item.grp_id ? "groupChat" : "channel",
                user_profile_object_key: item.user_profile_object_key,
                user_uuid: item.user_uuid,
                user_dgraph_uid: item.user_dgraph_uid,
                channel_uuid: item.channel_uuid,
                channel_dgraph_uid: item.channel_dgraph_uid,
                user_name: item.user_name,
                channel_name: item.channel_name,
                grp_id: item.grp_id,
                grp_dgraph_uid: item.grp_dgraph_uid,
                grp_name: item.grp_name,
            }))
        } catch (error) {
            console.error("Search error:", error)
            return []
        }
    }

    function renderSearchItem(item: ForwardMessageSearchItem, isHighlighted: boolean) {
        return (
            <div className="flex items-center space-x-2">
                {item.type === "user" ? (
                    <FwdMsgToProfileAvatar userProfileObjKey={item.user_profile_object_key} userName={item.name} />
                ) : item.type === "groupChat" ? (
                    <Users className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <Hash className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex flex-col">
                    <span className="text-sm font-semibold">{item.name}</span>
                    {item.type === "groupChat" && (
                        <span className="text-xs text-muted-foreground">Group chat</span>
                    )}
                </div>
            </div>
        )
    }

    function handleSelectItems(items: ForwardMessageSearchItem[]) {
        if (onSelect) {
            // Convert back to the original type expected by the parent component
            const convertedItems = items.map((item) => {
                if (item.type === "user") {
                    return {
                        user_uuid: item.user_uuid,
                        user_name: item.user_name,
                        user_profile_object_key: item.user_profile_object_key,
                        user_dgraph_uid: item.user_dgraph_uid,
                        type: "user"
                    } as ChannelAndUserListInterfaceResp
                } else if (item.type === "groupChat") {
                    return {
                        grp_id: item.grp_id,
                        grp_dgraph_uid: item.grp_dgraph_uid,
                        grp_name: item.grp_name,
                        type: "groupChat"
                    } as ChannelAndUserListInterfaceResp
                } else {
                    return {
                        channel_uuid: item.channel_uuid,
                        channel_name: item.channel_name,
                        channel_dgraph_uid: item.channel_dgraph_uid,
                        type: "channel"
                    } as ChannelAndUserListInterfaceResp
                }
            })

            onSelect(convertedItems)
        }
    }

    return (
        <MultiSelectSearch
            onSearch={handleSearch}
            onSelect={handleSelectItems}
            renderItem={renderSearchItem}
            placeholder={placeholder}
            maxItems={maxItems}
            className={className}
        />
    )
}
