"use client";


import {useMedia} from "@/context/MediaQueryContext";
import {ProjectTaskDesktop} from "@/components/project/projectTaskDesktop";
import dynamic from "next/dynamic";
import { TabLoading } from "@/components/task/TabLoading";
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { app_project_path } from "@/types/paths"

// The phone's project page is its own chunk: a desktop never loads it.
const ProjectListTabs = dynamic(() => import("@/components/project/projectListTabs").then((m) => m.ProjectListTabs), { loading: () => <TabLoading kind="list" /> });

export function ProjectView({ projectId }: { projectId: string }) {

    const { isMobile, isDesktop } = useMedia();
    // The project's own read decides the page (PTC-1). A project the reader
    // isn't in, or one that isn't there, says so in place of the whole page:
    // no name, no tabs, no New task, which read as a live project with
    // nothing in it and "a connection problem". The header and the phone's
    // tabs make the same request, so it is sent once.
    const info = useFetch<ProjectInfoRawInterface>(projectId ? `${GetEndpointUrl.GetProjectInfo}/${projectId}` : "", undefined, undefined, OWN_ERRORS)

    if(!projectId)return

    if (info.isError && !info.data) {
        return (
            <LoadFailureState
                error={info.isError}
                noun="project"
                onRetry={() => void info.mutate()}
                back={{ label: "Back to projects", href: app_project_path }}
                noAccessDetail="Only the project's members can open it. Ask one of its admins to add you."
                className="pt-20"
            />
        )
    }

    return (
        <>
            {isMobile && <ProjectListTabs projectId={projectId}/>}
            {isDesktop && <ProjectTaskDesktop projectId={projectId}/>}
        </>
    )
}
