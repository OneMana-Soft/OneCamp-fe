"use client"

import type * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import {UserProfileDataInterface} from "@/types/user";
import {SingleAvatar} from "@/components/groupedAvatar/singleAvatar";


interface GroupedAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
    users: UserProfileDataInterface[]
    /** Maximum number of avatars to display before showing a count */
    max?: number
    /** Size of avatars in pixels */
    size?: number
    /** How much each avatar should overlap in pixels */
    overlap?: number
}

export function GroupedAvatar({ users, max = 4, size = 40, overlap = 8, className, ...props }: GroupedAvatarProps) {
    const visibleUsers = users.slice(0, max)
    const remainingCount = users.length > max ? users.length - max : 0

    return (
        <div className={cn("flex items-center", className)} style={{ paddingRight: size / 2 }} {...props}>
            {visibleUsers.map((user, index) => (
                <div
                    key={user.user_uuid}
                    className="relative rounded-full border-r border-background"
                    style={{
                        width: size,
                        height: size,
                        marginLeft: index === 0 ? 0 : -overlap,
                        zIndex: visibleUsers.length - index,
                    }}
                >
                    <SingleAvatar userInfo={user} size={size}/>
                </div>
            ))}

            {remainingCount > 0 && (
                <div
                    className="relative flex items-center justify-center rounded-full bg-muted text-muted-foreground  font-medium"
                    style={{
                        width: size,
                        height: size,
                        marginLeft: -overlap,
                        zIndex: 0,
                        fontSize: size / 3,
                    }}
                >
                    +{remainingCount}
                </div>
            )}
        </div>
    )
}

