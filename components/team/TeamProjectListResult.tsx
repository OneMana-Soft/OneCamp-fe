import * as React from "react"
import { app_project_path } from "@/types/paths"
import Link from "next/link"
import { TeamProjectInfoMobile } from "@/components/team/TeamProjectInfoMobile"
import { ProjectInfoInterface } from "@/types/project"
import { useMedia } from "@/context/MediaQueryContext"
import { useToast } from "@/hooks/use-toast"

/**
 * Project list rendering shared between mobile + desktop. ListRow inside
 * `TeamProjectInfoMobile` handles hover, focus, press flash, and selected
 * states, so we no longer need TouchableDiv ripples or manual Separator
 * dividers. Non-members get a toast on tap explaining they can't enter.
 */
export const TeamProjectListResult = ({
    projectList,
    isAdmin,
    teamId,
    isUsersProject,
}: {
    projectList: ProjectInfoInterface[]
    isAdmin: boolean
    teamId: string
    isUsersProject: boolean
}) => {
    const { isDesktop } = useMedia()
    const { toast } = useToast()

    const handleClick = (e: React.MouseEvent, projectInfo: ProjectInfoInterface) => {
        if (!projectInfo.project_is_member && !isUsersProject) {
            e.preventDefault()
            toast({
                title: "Membership Required",
                description: "You are not a member of this project.",
                variant: "destructive",
            })
        }
    }

    return (
        <div className="w-full flex justify-center">
            <div className="w-full md:w-[40vw] md:px-6 px-1 py-1.5">
                {projectList.map((project) => (
                    <Link
                        key={project.project_uuid}
                        href={`${app_project_path}/${project.project_uuid}`}
                        className="block focus:outline-none"
                        onClick={(e) => handleClick(e, project)}
                    >
                        <TeamProjectInfoMobile
                            projectInfo={project}
                            isAdmin={isAdmin}
                            teamId={teamId}
                            isUsersProject={isUsersProject}
                        />
                    </Link>
                ))}
            </div>
        </div>
    )
}
