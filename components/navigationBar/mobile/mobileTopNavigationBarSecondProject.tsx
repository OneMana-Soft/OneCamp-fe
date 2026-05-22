"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ProjectInfoRawInterface } from "@/types/project"
import { ColorIcon } from "@/components/colorIcon/colorIcon"

export function MobileTopNavigationBarSecondProject({ projectUUID }: { projectUUID: string }) {
    const projectInfo = useFetch<ProjectInfoRawInterface>(
        GetEndpointUrl.GetProjectInfo + "/" + projectUUID,
    )

    const projectName = projectInfo.data?.data.project_name || "Project"

    return (
        <div className="flex justify-center items-center gap-2 min-w-0 px-2">
            <ColorIcon name={projectInfo.data?.data.project_uuid || projectUUID} size="xs" />
            <span className="text-base font-semibold text-foreground truncate">
                {projectName}
            </span>
        </div>
    )
}
