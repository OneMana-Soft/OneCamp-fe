import { displayNameOf, personKeywords } from "@/lib/personName"
import { useTranslation } from "@/lib/utils/i18n"
import { Button } from "@/components/ui/button"
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
} from "@/components/ui/combobox"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { NobodyMark } from "@/components/ui/graphics/NobodyMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {UserProfileDataInterface} from "@/types/user";
import {useUserAvatar} from "@/hooks/useUserAvatar";

/** The row that takes the assignee off. */
const NOBODY = "__nobody__"

interface SubTaskAssigneeProps {
    userProfile?: UserProfileDataInterface
    taskProjectMembers?: UserProfileDataInterface[]
    assigneeUpdate: (u: UserProfileDataInterface | undefined) => void
}

/** A subtask's assignee: their 18px avatar (a dashed ring for nobody), opening the project's people. */
export default function TaskSubTaskAssignee({ userProfile, assigneeUpdate, taskProjectMembers }: SubTaskAssigneeProps) {
    const { t } = useTranslation()
    const {src: imageSrc} = useUserAvatar(userProfile?.user_profile_object_key);

    return (
        <Combobox>
            <Tooltip>
                <TooltipTrigger asChild>
                    <ComboboxTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={userProfile ? `Assigned to ${displayNameOf(userProfile)}. Change` : "Assign this subtask"}
                            className="size-6 rounded-full !p-0"
                        >
                            {userProfile ? (
                                <IdentityMark variant="avatar" id={avatarSeed(userProfile)} label={displayNameOf(userProfile)} src={imageSrc} size={18} />
                            ) : (
                                // Nobody yet: W19's unassigned ghost.
                                <NobodyMark />
                            )}
                        </Button>
                    </ComboboxTrigger>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{t('assignee')}</p>
                </TooltipContent>
            </Tooltip>
            <ComboboxContent label={t('assignee')} selected={userProfile?.user_uuid ?? NOBODY}>
                <ComboboxInput placeholder={t('searchMemberPlaceholder')} />
                <ComboboxList>
                    <ComboboxEmpty>{t('noMemberFound')}</ComboboxEmpty>
                    {/* Nobody, as a row to choose, checked while no one is: the trigger's dashed ring. */}
                    <ComboboxItem value={NOBODY} keywords={["No one", "nobody", "unassign"]} checked={!userProfile} onSelect={() => userProfile && assigneeUpdate(undefined)} className="text-muted-foreground">
                        <NobodyMark />
                        <span className="min-w-0 flex-1 truncate">No one</span>
                    </ComboboxItem>
                    {taskProjectMembers?.map((member: UserProfileDataInterface) => (
                        <ComboboxItem
                            key={member.user_uuid}
                            value={member.user_uuid}
                            keywords={personKeywords(member)}
                            checked={userProfile?.user_uuid === member.user_uuid}
                            onSelect={(uuid) => uuid !== userProfile?.user_uuid && assigneeUpdate(taskProjectMembers.find((m) => m.user_uuid === uuid))}
                        >
                            <span className="min-w-0 flex-1 truncate">{displayNameOf(member)}</span>
                        </ComboboxItem>
                    ))}
                </ComboboxList>
            </ComboboxContent>
        </Combobox>
    )
}
