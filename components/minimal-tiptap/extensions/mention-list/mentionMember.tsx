import React from 'react';
import { UserProfileDataInterface } from "@/types/user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
import { cn } from "@/lib/utils/helpers/cn";

interface ComboboxChannelMemberList {
    person: UserProfileDataInterface
    ind: number
    selectItem: (ind: number) => void
    selectedIndex: number
}

const MentionMember: React.FC<ComboboxChannelMemberList> = ({ person, selectItem, ind, selectedIndex }) => {
    
    const {src: imageSrc} = useUserAvatar(person.user_profile_object_key);

    const nameInitials = getNameInitials(person.user_name);

    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-pointer transition-colors",
                ind === selectedIndex 
                    ? "bg-accent text-accent-foreground" 
                    : "hover:bg-muted"
            )}
            onClick={() => selectItem(ind)}
        >
            <Avatar className="h-6 w-6">
                <AvatarImage
                    src={imageSrc}
                    alt={person.user_name}
                />
                <AvatarFallback className={cn("text-[9px] font-semibold", getAvatarFallbackClass(person.user_name))}>{nameInitials}</AvatarFallback>
            </Avatar>

            <div className='flex flex-col min-w-0'>
                <div className="flex items-center gap-1.5 leading-none">
                    <span className="font-medium truncate">{person.user_name}</span>
                    {person.is_bot && (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-primary">
                            AI
                        </span>
                    )}
                </div>
                {person.user_email_id && !person.is_bot && (
                    <div className='text-xs text-muted-foreground truncate max-w-[150px] mt-0.5 leading-none'>
                        {person.user_email_id}
                    </div>
                )}
                {person.is_bot && (
                    <div className='text-xs text-muted-foreground truncate max-w-[150px] mt-0.5 leading-none'>
                        AI teammate
                    </div>
                )}
            </div>
        </div>
    )
}

export default MentionMember;