import { useLongPress } from "@/hooks/useLongPress";
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch";
import { ProjectInfoInterface } from "@/types/project";
import { Badge } from "@/components/ui/badge";
import { ColorIcon } from "@/components/colorIcon/colorIcon";
import { openUI } from "@/store/slice/uiSlice";
import { useDispatch } from "react-redux";
import * as React from "react";
import { useMedia } from "@/context/MediaQueryContext";
import { statusColors } from "@/lib/colors";
import { cn } from "@/lib/utils/helpers/cn";
import { ListRow } from "@/components/ui/listRow";

/**
 * Project row for the mobile project list (both team-scoped and user
 * "all projects" views). Long-press opens the project options drawer
 * (admins only). The leading slot uses the brand-colour avatar tile
 * keyed off the project UUID; trailing badges show membership and
 * archive state for admins. Member count and team name appear as
 * subtitle so the row stays a single line on phones.
 */
export const TeamProjectInfoMobile = ({
    projectInfo,
    isAdmin,
    teamId,
    isUsersProject,
}: {
    projectInfo: ProjectInfoInterface
    isAdmin: boolean
    teamId: string
    isUsersProject: boolean
}) => {
    const { isDesktop } = useMedia()
    const dispatch = useDispatch()

    const onLongPress = () => {
        if (isDesktop) return
        if (!isAdmin && !projectInfo.project_is_member && !isUsersProject) return

        dispatch(
            openUI({
                key: "projectLongPress",
                data: {
                    isAdmin,
                    projectId: projectInfo.project_uuid,
                    teamId: teamId || projectInfo.project_team?.team_uuid,
                    isMember: projectInfo.project_is_member || isUsersProject,
                    isDeleted: !isZeroEpoch(projectInfo.project_deleted_at),
                },
            }),
        )
    }

    const longPressEvent = useLongPress(onLongPress, { threshold: 500 })

    const isArchived = isAdmin && !isZeroEpoch(projectInfo.project_deleted_at || "")

    const memberCount = projectInfo.project_member_count || 0
    const teamName = projectInfo.project_team?.team_name

    const subtitleParts: string[] = []
    if (memberCount > 0) {
        subtitleParts.push(`${memberCount} ${memberCount === 1 ? "member" : "members"}`)
    }
    if (teamName && !teamId) {
        // Only show team name in the "all projects" view; in a team-scoped
        // list it's redundant.
        subtitleParts.push(teamName)
    }
    const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined

    const trailing = (
        <>
            {projectInfo.project_is_member && !isArchived && (
                <Badge
                    variant="outline"
                    className={cn(
                        "text-[10px] px-1.5 py-0 h-4 font-medium",
                        statusColors.success.borderLight,
                        statusColors.success.bgLight,
                        statusColors.success.text,
                    )}
                >
                    Member
                </Badge>
            )}
            {isArchived && (
                <Badge variant="secondary" className="text-[10px] h-5">
                    Archived
                </Badge>
            )}
        </>
    )

    return (
        <div {...longPressEvent}>
            <ListRow
                density="default"
                leading={<ColorIcon name={projectInfo.project_uuid} size="sm" />}
                title={projectInfo.project_name}
                subtitle={subtitle}
                trailing={trailing}
            />
        </div>
    )
}
