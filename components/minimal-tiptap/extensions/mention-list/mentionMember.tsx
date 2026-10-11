import React from 'react';
import { UserProfileDataInterface } from "@/types/user";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { AgentAvatar } from "@/components/ui/graphics";
import { displayNameOf, handleOf } from "@/lib/personName";

/**
 * A row of the @mention picker (content.md D24, chat.md C41), as the
 * CommandList draws it: the person's 24 px avatar (an agent's square), then
 * the name at 510 and the @handle they are mentioned by, at 12 ink-3.
 */
export function MentionAvatar({ person }: { person: UserProfileDataInterface }) {
    const { src } = useUserAvatar(person.user_profile_object_key);
    if (person.is_bot) {
        return (
            <span className="inline-flex size-6 rounded-[32%]">
                <AgentAvatar src={src || undefined} />
            </span>
        );
    }
    return <IdentityMark id={person.user_uuid} label={displayNameOf(person)} src={src || undefined} variant="avatar" size={24} />;
}

const MentionMember: React.FC<{ person: UserProfileDataInterface; [rest: string]: unknown }> = ({ person }) => {
    const name = displayNameOf(person);
    const handle = handleOf(person);
    return (
        <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-[510] text-ink">{name}</span>
            {handle && <span className="truncate text-meta text-ink-3">@{handle}</span>}
        </span>
    );
};

export default MentionMember;
