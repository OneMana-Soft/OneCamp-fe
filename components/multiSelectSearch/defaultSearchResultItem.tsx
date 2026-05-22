"use client"

import { Hash } from "@/lib/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {SearchableItem} from "@/types/search";

interface DefaultSearchResultItemProps {
    item: SearchableItem
}

export function DefaultSearchResultItem({ item }: DefaultSearchResultItemProps) {
    const isUser = item.type === "user"

    return (
        <div className="flex items-center space-x-2">
            {isUser ? (
                <Avatar className="h-6 w-6">
                    {item.imageUrl && <AvatarImage src={item.imageUrl} alt={item.name} />}
                    <AvatarFallback>{item.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
            ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                    <Hash className="h-3 w-3 text-muted-foreground" />
                </div>
            )}
            <div className="flex flex-col">
                <span className="text-sm font-semibold">{item.name}</span>
                {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
            </div>
        </div>
    )
}
